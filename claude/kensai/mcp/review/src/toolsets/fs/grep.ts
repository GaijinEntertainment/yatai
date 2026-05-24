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

	if (root !== "." && !rfs.fileExists(root) && !rfs.dirExists(root)) {
		return ok(`[root not found: ${root}]${formatSuggestions(suggestPaths(rfs, root))}`);
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
					description:
						"Search file contents by regex, matched per-line. Use find_files for filenames, list_dir for directories.",
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
