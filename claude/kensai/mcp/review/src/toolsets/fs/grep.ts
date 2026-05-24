import { z } from "zod";

import { errFrom, ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	pattern: z.string().describe("Search pattern (regex)."),
	include: z.string().optional().describe("Glob pattern to include files."),
	exclude: z.string().optional().describe("Glob pattern to exclude files."),
	limit: z.number().int().positive().optional().describe("Maximum matches. Defaults to 100."),
});

type Input = z.infer<typeof inputSchema>;

async function handle(ctx: ToolContext, args: Input) {
	try {
		const result = await ctx.rfs().grep(args.pattern, {
			glob: args.include,
			maxResults: args.limit ?? 100,
		});
		if (result.lineCount === 0) return ok("No matches.");
		return ok(result.output);
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
					description: "Search file contents via ripgrep, scoped to the repository root.",
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
