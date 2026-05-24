import { ok, err } from "../result.ts";
import type { Session, ToolRegistrar } from "../types.ts";

export interface EndContext {
	getSession(): Session | null;
	end(): void;
}

function handle(ctx: EndContext) {
	if (!ctx.getSession()) return err("No active session.");
	ctx.end();
	return ok("Session ended.");
}

export function sessionEndTool(ctx: EndContext): ToolRegistrar {
	return {
		name: "session_end",
		register(server) {
			return server.registerTool("session_end", { description: "End the active review session." }, () => handle(ctx));
		},
	};
}
