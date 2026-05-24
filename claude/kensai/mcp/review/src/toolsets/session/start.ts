import { z } from "zod";

import type { Session, ToolRegistrar } from "../types.ts";

/** Callbacks provided by SessionToolset for session_start. */
export interface StartContext {
	getSession(): Session | null;
	start(root: string, mode: "committed" | "uncommitted" | "all"): Promise<void>;
}

/** session_start tool — initializes a review session for a git repository. */
export function sessionStartTool(ctx: StartContext): ToolRegistrar {
	const name = "session_start";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Initialize a review session for a git repository.",
					inputSchema: {
						root: z.string().describe("Absolute path to the repository root."),
						mode: z
							.enum(["committed", "uncommitted", "all"])
							.optional()
							.describe("Review mode. Defaults to committed."),
					},
				},
				async (args) => {
					if (ctx.getSession()) {
						throw new Error("Session already active. Call session_end first.");
					}

					await ctx.start(args.root, args.mode ?? "committed");

					return {
						content: [{ type: "text", text: `Session started: root=${args.root}, mode=${args.mode ?? "committed"}` }],
					};
				},
			);
		},
	};
}
