import { ok, err } from "../result.ts";
import type { Session, ToolRegistrar } from "../types.ts";

interface ProvingCompleteContext {
	getSession(): Session;
}

function handle(ctx: ProvingCompleteContext) {
	const session = ctx.getSession();

	if (session.phase !== "PROVING") return err(`Cannot complete proving: current phase is ${session.phase}.`);

	const pending = session.findings.list({ status: "pending" }).length;
	if (pending > 0) return err(`Cannot complete proving: ${pending} finding(s) still pending verdict.`);

	session.advance("FILING");
	return ok("Proving complete. Phase: FILING.");
}

export function provingCompleteTool(ctx: ProvingCompleteContext): ToolRegistrar {
	return {
		name: "proving_complete",
		register(server) {
			return server.registerTool(
				"proving_complete",
				{ description: "Complete the proving phase. Transitions from PROVING to FILING." },
				() => handle(ctx),
			);
		},
	};
}
