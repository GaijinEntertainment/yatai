import { z } from "zod";

import type { RepoFs } from "../../repofs/repofs.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by FsToolset for read_file. */
export interface ReadFileContext {
	rfs(): RepoFs;
}

/** read_file tool — reads a file from the repository with line numbers. */
export function readFileTool(ctx: ReadFileContext): ToolRegistrar {
	const name = "read_file";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Read a file from the repository with line numbers.",
					inputSchema: {
						path: z.string().describe("File path relative to the repository root."),
						line_offset: z.number().int().positive().optional().describe("Start line (1-based). Defaults to 1."),
						line_limit: z.number().int().positive().optional().describe("Maximum lines to return. Defaults to 2000."),
					},
					annotations: { readOnlyHint: true },
				},
				async (args) => {
					ctx.rfs();
					return { content: [{ type: "text", text: `[stub] read_file: path=${args.path}` }] };
				},
			);
		},
	};
}
