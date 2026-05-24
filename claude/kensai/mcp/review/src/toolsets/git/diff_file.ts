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
	if (!rfs.fileExists(args.path) && !session.changedFiles.some((f) => f.path === args.path)) {
		return ok(`[file not found: ${args.path}]${formatSuggestions(suggestPaths(rfs, args.path))}`);
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
					description:
						"Show the annotated unified diff for one file in the review. Use changed_files to find paths first.",
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
