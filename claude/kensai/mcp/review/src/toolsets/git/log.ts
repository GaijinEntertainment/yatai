import { z } from "zod";

import type { RepoFs } from "../../repofs/repofs.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by GitToolset for log. */
export interface LogContext {
	rfs(): RepoFs;
}

/** log tool — get commit history. */
export function logTool(ctx: LogContext): ToolRegistrar {
	const name = "log";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Get commit history for the repository.",
					inputSchema: {
						ref: z.string().optional().describe("Git ref to start from. Defaults to HEAD."),
						count: z.number().int().positive().optional().describe("Number of commits. Defaults to 10."),
					},
					annotations: { readOnlyHint: true },
				},
				async (args) => {
					ctx.rfs();
					return { content: [{ type: "text", text: `[stub] log: ref=${args.ref ?? "HEAD"}` }] };
				},
			);
		},
	};
}
