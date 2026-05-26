import { z } from "zod";

import type { IndexEntry } from "../../repofs/pathindex/pathindex.ts";
import { errFrom, formatSuggestions, ok, suggestPaths } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const DEFAULT_MAX_DEPTH = 1;
const DEFAULT_MAX_ENTRIES = 1000;
const EXCLUDE_DIRS = ["vendor", "node_modules", ".git", "dist", "build", "__pycache__"];

const inputSchema = z.object({
	path: z.string().describe('Directory path relative to root. Use "." for root.'),
	max_depth: z
		.number()
		.int()
		.positive()
		.nullable()
		.optional()
		.describe("Recursion depth. 1 = direct children. Defaults to 1."),
	skip_dotfiles: z.boolean().nullable().optional().describe("Omit entries starting with '.'. Defaults to false."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: ToolContext, args: Input) {
	const dirPath = args.path || ".";
	const maxDepth = args.max_depth ?? DEFAULT_MAX_DEPTH;
	const skipDotfiles = args.skip_dotfiles ?? false;

	const rfs = ctx.rfs();
	const dir = rfs.index.dir(dirPath);

	if (!dir) {
		try {
			if (rfs.fileExists(dirPath)) {
				return ok(`[${dirPath}: is a file, not a directory (use read_file instead)]`);
			}
		} catch (error) {
			return errFrom(error);
		}
		return ok(`[directory not found: ${dirPath}]${formatSuggestions(suggestPaths(rfs, dirPath))}`);
	}

	const state = { count: 0, truncated: false };
	const lines: string[] = [];

	collect(dir.children, dirPath === "." ? "" : dirPath, maxDepth, 1, skipDotfiles, DEFAULT_MAX_ENTRIES, lines, state);

	if (lines.length === 0 && !state.truncated) return ok("[directory is empty]");

	let body = lines.join("");
	if (state.truncated) {
		body += `... (truncated at ${state.count} entries; scope with search tools)\n`;
	}

	return ok(body);
}

function collect(
	children: IndexEntry[],
	prefix: string,
	maxDepth: number,
	currentDepth: number,
	skipDotfiles: boolean,
	maxEntries: number,
	out: string[],
	state: { count: number; truncated: boolean },
): void {
	for (const child of children) {
		if (state.truncated) return;

		if (skipDotfiles && child.name.startsWith(".")) continue;

		if (state.count >= maxEntries) {
			state.truncated = true;
			return;
		}

		const rel = prefix ? `${prefix}/${child.name}` : child.name;
		state.count++;

		if (child.type === "dir") {
			out.push(`${rel}/\n`);
			if (currentDepth < maxDepth && !EXCLUDE_DIRS.includes(child.name)) {
				collect(child.children, rel, maxDepth, currentDepth + 1, skipDotfiles, maxEntries, out, state);
			}
		} else if (child.type === "file") {
			out.push(`${rel} (${child.size} bytes)\n`);
		} else {
			out.push(`${rel} -> ${child.target}\n`);
		}
	}
}

export function listDirTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "list_dir",
		register(server) {
			return server.registerTool(
				"list_dir",
				{
					description: [
						`List directory entries with depth control. Use search tools for content or file-name patterns, read_file to read a file. Default depth ${DEFAULT_MAX_DEPTH}; capped at ${DEFAULT_MAX_ENTRIES} entries.`,
						"",
						"Reach for alternatives instead when:",
						"  - You want files matching a name or content pattern -> use grep or find_files.",
						"  - You want to read a file's contents -> read_file.",
						"",
						"Behaviour:",
						`  - Default max_depth is ${DEFAULT_MAX_DEPTH} (direct children only). Pass max_depth N to descend N levels.`,
						`  - Total entries capped at ${DEFAULT_MAX_ENTRIES}. Truncation marker names the cap that fired.`,
						'  - Dotfiles shown by default; skip_dotfiles=true omits "."-prefixed entries.',
						`  - Descent suppressed for: ${EXCLUDE_DIRS.join(", ")}. The entry itself is still listed.`,
						'  - Output: one entry per line. Directories as "path/", files as "path (N bytes)". Sorted alphabetically.',
						"  - Empty directory -> [directory is empty] marker, not a tool error.",
					].join("\n"),
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
