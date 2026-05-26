import { z } from "zod";

import { resolveRefs } from "../../session/session.ts";
import { err, errFrom, formatSuggestions, ok, suggestPaths } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const DEFAULT_CONTEXT_LINES = 3;

const inputSchema = z.object({
	path: z.string().describe("File path to diff (repository-relative)."),
	context_lines: z.number().int().nonnegative().optional().describe("Context lines around changes. Defaults to 3."),
});

type Input = z.infer<typeof inputSchema>;

async function handle(ctx: ToolContext, args: Input) {
	if (!args.path) return err("path is required; use changed_files first to list modified files");

	const session = ctx.session();
	const { base, head } = resolveRefs(session.mode);
	const headLabel = head ?? "working tree";
	const header = `path: ${args.path}\nbase: ${base}\nhead: ${headLabel}\n`;

	const rfs = ctx.rfs();
	try {
		if (!rfs.fileExists(args.path) && !session.changedFiles.some((f) => f.path === args.path)) {
			return ok(`[file not found: ${args.path}]${formatSuggestions(suggestPaths(rfs, args.path))}`);
		}
	} catch (error) {
		return errFrom(error);
	}

	try {
		const diff = await rfs.git.diffFile(base, head, args.path, args.context_lines ?? DEFAULT_CONTEXT_LINES);
		if (!diff) return ok(header + "[no changes]\n");
		return ok(header + "\n" + diff);
	} catch (error) {
		return errFrom(error);
	}
}

export function diffFileTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "diff_file",
		register(server) {
			return server.registerTool(
				"diff_file",
				{
					description: [
						"Show the line-annotated unified diff for one file in the review. Use changed_files to find paths first, log for commit history.",
						"",
						"Reach for alternatives instead when:",
						"  - You don't know which files changed -> changed_files.",
						"  - You want recent commit history -> log.",
						"",
						"Behaviour:",
						"  - path is required and repository-relative. base/head derived from session review mode.",
						'  - Each hunk line is prefixed with the new-file line number: "%4d + " for additions, "%4d   " for context,',
						'    "   -   " for deletions. Cite these printed numbers when posting comments -- deletions have no number.',
						"  - Plain text body. Header lists path/base/head before hunks.",
						'  - Empty diff -> "[no changes]" with path/base/head header.',
						"",
						"Constraints:",
						"  - Bad path -> soft error with fuzzy path suggestions.",
					].join("\n"),
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
