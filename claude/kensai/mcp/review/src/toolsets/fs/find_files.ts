import { z } from "zod";

import { ok, err } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const DEFAULT_MAX_RESULTS = 20;

const inputSchema = z.object({
	query: z.string().describe("Fuzzy search pattern for file paths. Keep short — 1-2 terms max."),
	max_results: z.number().int().positive().optional().describe("Maximum results. Defaults to 20."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: ToolContext, args: Input) {
	const query = args.query.trim();
	if (!query) return err("query is required");

	const maxResults = args.max_results ?? DEFAULT_MAX_RESULTS;
	const results = ctx.rfs().findFiles(query, { maxResults });

	if (results.length === 0) return ok("[no files found]");

	let body = results.join("\n") + "\n";
	if (results.length >= maxResults) {
		body += `\n(${results.length} results shown, ${ctx.rfs().index.length} files indexed — refine query to narrow)`;
	}

	return ok(body);
}

export function findFilesTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "find_files",
		register(server) {
			return server.registerTool(
				"find_files",
				{
					description: "Discover files by name with fuzzy matching. Use grep for contents, list_dir for directories.",
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
