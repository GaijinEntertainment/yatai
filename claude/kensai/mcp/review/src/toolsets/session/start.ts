import { z } from "zod";

import type { ReviewMode } from "../../session/session.ts";
import { err, errFrom, ok } from "../result.ts";
import type { Session, ToolRegistrar } from "../types.ts";

/** Callbacks provided by SessionToolset for session_start. */
export interface StartContext {
	getSession(): Session | null;
	start(root: string, mode: ReviewMode): Promise<void>;
}

const inputSchema = z.object({
	root: z.string().describe("Absolute path to the repository root."),
	mode: z.enum(["committed", "uncommitted", "all"]).optional().describe("Review mode. Defaults to committed."),
});

type Input = z.infer<typeof inputSchema>;

async function handle(ctx: StartContext, args: Input) {
	if (ctx.getSession()) return err("Session already active. Call session_end first.");

	try {
		await ctx.start(args.root, args.mode ?? "committed");
	} catch (error) {
		return errFrom(error);
	}

	return ok(`Session started: root=${args.root}, mode=${args.mode ?? "committed"}`);
}

/** session_start tool — initializes a review session for a git repository. */
export function sessionStartTool(ctx: StartContext): ToolRegistrar {
	return {
		name: "session_start",
		register(server) {
			return server.registerTool(
				"session_start",
				{ description: "Initialize a review session for a git repository.", inputSchema },
				(args) => handle(ctx, args),
			);
		},
	};
}
