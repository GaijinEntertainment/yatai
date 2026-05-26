import { z } from "zod";

import { err, errFrom, formatSuggestions, ok, suggestPaths } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const DEFAULT_MAX_RESULTS = 100;

const inputSchema = z.object({
	pattern: z.string().describe("RE2 regex matched per-line against file contents."),
	root: z.string().optional().describe('Path to search under, relative to repo root. Defaults to "." (repo root).'),
	glob: z.string().optional().describe("Glob pattern to filter files (e.g. **.go, *.tsx)."),
	case_insensitive: z.boolean().optional().describe("Case-fold regex matching. Defaults to false."),
	max_results: z.number().int().positive().optional().describe("Cap on matching lines. Defaults to 100."),
});

type Input = z.infer<typeof inputSchema>;

async function handle(ctx: ToolContext, args: Input) {
	if (!args.pattern) return err("pattern is required");

	const rfs = ctx.rfs();
	const root = args.root?.trim() || ".";

	try {
		if (root !== "." && !rfs.fileExists(root) && !rfs.dirExists(root)) {
			return ok(`[root not found: ${root}]${formatSuggestions(suggestPaths(rfs, root))}`);
		}
	} catch (error) {
		return errFrom(error);
	}

	try {
		const result = await rfs.grep(args.pattern, {
			target: root !== "." ? [root] : undefined,
			glob: args.glob,
			caseInsensitive: args.case_insensitive,
			maxResults: args.max_results ?? DEFAULT_MAX_RESULTS,
		});

		if (result.lineCount === 0) return ok("[no matches found]");

		let body = result.output;
		if (result.truncated) {
			body += `... (truncated at ${result.lineCount} lines; narrow with root or glob)\n`;
		}

		return ok(body);
	} catch (error) {
		return errFrom(error);
	}
}

export function grepTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "grep",
		register(server) {
			return server.registerTool(
				"grep",
				{
					description: [
						`Search file contents by regex, matched per-line. find_files for filenames, list_dir for one directory, read_file once you have the path. Capped at ${DEFAULT_MAX_RESULTS} matches.`,
						"",
						"Reach for alternatives instead when:",
						"  - You need files by path shape -> find_files.",
						"  - You already have the path -> read_file.",
						"  - You want one directory's entries -> list_dir.",
						"",
						"Behaviour:",
						"  - pattern: RE2 regex. Matched per-line; multiple matches on one line reported once.",
						'  - root scopes the search ("." or "" = repo root). May point at a single file.',
						"  - glob narrows the file set. Empty matches all files.",
						"  - case_insensitive folds matching when true; null = false.",
						`  - max_results caps lines returned. Default ${DEFAULT_MAX_RESULTS}.`,
						"  - Binary files auto-skipped.",
						'  - Output: one match per line as "path:line-number:matched-text". Context lines included.',
						'  - No matches -> "[no matches found]", not a tool error.',
						"",
						"Constraints:",
						"  - No backreferences (\\1), no lookarounds ((?=..)), no literal newline in pattern.",
						'  - "^" and "$" anchor per-line, not per-file.',
						'  - Glob is gitignore-style -- "**" crosses path separators, "*" stays within one segment.',
					].join("\n"),
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
