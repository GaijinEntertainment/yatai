import { ok, err } from "../result.ts";
import type { Session, ToolRegistrar } from "../types.ts";

interface SurfacingCompleteContext {
	getSession(): Session;
}

function handle(ctx: SurfacingCompleteContext) {
	const session = ctx.getSession();

	if (session.phase !== "SURFACING") return err(`Cannot complete surfacing: current phase is ${session.phase}.`);

	const pendingCount = session.findings.list({ status: "pending" }).length;

	if (pendingCount === 0) {
		session.advance("FILING");
		return ok("Surfacing complete. 0 findings — skipping PROVING. Phase: FILING.");
	}

	session.advance("PROVING");
	return ok(`Surfacing complete. ${pendingCount} finding(s) to prove. Phase: PROVING.`);
}

export function surfacingCompleteTool(ctx: SurfacingCompleteContext): ToolRegistrar {
	return {
		name: "surfacing_complete",
		register(server) {
			return server.registerTool(
				"surfacing_complete",
				{ description: "Complete the surfacing phase. Transitions to PROVING (or FILING if 0 findings)." },
				() => handle(ctx),
			);
		},
	};
}
