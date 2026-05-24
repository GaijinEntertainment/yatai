import { z } from "zod";

import type { RepoFs } from "../../repofs/repofs.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by FsToolset for grep. */
export interface GrepContext {
	rfs(): RepoFs;
}

/** grep tool — content search via ripgrep scoped to the repository. */
export function grepTool(ctx: GrepContext): ToolRegistrar {
	const name = "grep";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Search file contents via ripgrep, scoped to the repository root.",
					inputSchema: {
						pattern: z.string().describe("Search pattern (regex)."),
						include: z.string().optional().describe("Glob pattern to include files."),
						exclude: z.string().optional().describe("Glob pattern to exclude files."),
						limit: z.number().int().positive().optional().describe("Maximum matches. Defaults to 100."),
					},
					annotations: { readOnlyHint: true },
				},
				async (args) => {
					ctx.rfs();
					return { content: [{ type: "text", text: `[stub] grep: pattern=${args.pattern}` }] };
				},
			);
		},
	};
}
