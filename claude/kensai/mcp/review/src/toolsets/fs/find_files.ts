import { z } from "zod";

import { ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	pattern: z.string().describe("Search pattern for file paths."),
	limit: z.number().int().positive().optional().describe("Maximum results. Defaults to 20."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: ToolContext, args: Input) {
	const results = ctx.rfs().findFiles(args.pattern, { maxResults: args.limit ?? 20 });
	return ok(JSON.stringify(results));
}

export function findFilesTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "find_files",
		register(server) {
			return server.registerTool(
				"find_files",
				{
					description: "Fuzzy-search file paths in the repository index.",
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
