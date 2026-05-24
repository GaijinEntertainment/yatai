import { ok, err } from "../result.ts";
import type { Session, ToolRegistrar } from "../types.ts";

export interface StateContext {
	getSession(): Session | null;
}

function handle(ctx: StateContext) {
	const s = ctx.getSession();
	if (!s) return err("No active session.");

	return ok(
		`id=${s.id}, root=${s.root}, mode=${s.mode}, phase=${s.phase}, started=${s.startedAt.toISOString()}, findings=${s.findings.count()}`,
	);
}

export function sessionStateTool(ctx: StateContext): ToolRegistrar {
	return {
		name: "session_state",
		register(server) {
			return server.registerTool(
				"session_state",
				{ description: "Returns the current session state.", annotations: { readOnlyHint: true } },
				() => handle(ctx),
			);
		},
	};
}
