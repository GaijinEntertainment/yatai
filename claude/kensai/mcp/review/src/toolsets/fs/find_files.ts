import { z } from "zod";

import type { RepoFs } from "../../repofs/repofs.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by FsToolset for find_files. */
export interface FindFilesContext {
	rfs(): RepoFs;
}

/** find_files tool — fuzzy-search file paths in the repository index. */
export function findFilesTool(ctx: FindFilesContext): ToolRegistrar {
	const name = "find_files";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Fuzzy-search file paths in the repository index.",
					inputSchema: {
						pattern: z.string().describe("Search pattern for file paths."),
						limit: z.number().int().positive().optional().describe("Maximum results. Defaults to 20."),
					},
					annotations: { readOnlyHint: true },
				},
				async (args) => {
					ctx.rfs();
					return { content: [{ type: "text", text: `[stub] find_files: pattern=${args.pattern}` }] };
				},
			);
		},
	};
}
