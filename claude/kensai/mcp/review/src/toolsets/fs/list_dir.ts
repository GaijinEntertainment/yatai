import { z } from "zod";

import type { RepoFs } from "../../repofs/repofs.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by FsToolset for list_dir. */
export interface ListDirContext {
	rfs(): RepoFs;
}

/** list_dir tool — list directory entries from the repository index. */
export function listDirTool(ctx: ListDirContext): ToolRegistrar {
	const name = "list_dir";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "List directory entries from the repository index.",
					inputSchema: {
						path: z.string().optional().describe("Directory path relative to root. Defaults to root."),
						max_depth: z.number().int().positive().optional().describe("Recursion depth. Defaults to 1."),
						max_entries: z.number().int().positive().optional().describe("Maximum entries. Defaults to 1000."),
					},
					annotations: { readOnlyHint: true },
				},
				async (args) => {
					ctx.rfs();
					return { content: [{ type: "text", text: `[stub] list_dir: path=${args.path ?? "."}` }] };
				},
			);
		},
	};
}
