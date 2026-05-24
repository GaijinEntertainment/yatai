import { z } from "zod";

import type { RepoFs } from "../../repofs/repofs.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by GitToolset for diff_file. */
export interface DiffFileContext {
	rfs(): RepoFs;
}

/** diff_file tool — get the diff for a single file. */
export function diffFileTool(ctx: DiffFileContext): ToolRegistrar {
	const name = "diff_file";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Get the annotated diff for a single file in the review.",
					inputSchema: {
						path: z.string().describe("File path relative to the repository root."),
						context_lines: z
							.number()
							.int()
							.nonnegative()
							.optional()
							.describe("Context lines around changes. Defaults to 3."),
					},
					annotations: { readOnlyHint: true },
				},
				async (args) => {
					ctx.rfs();
					return { content: [{ type: "text", text: `[stub] diff_file: path=${args.path}` }] };
				},
			);
		},
	};
}
