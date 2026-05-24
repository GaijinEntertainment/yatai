import { ok, err } from "../result.ts";
import type { Session, ToolRegistrar } from "../types.ts";

interface FilingCompleteContext {
	getSession(): Session;
}

function handle(ctx: FilingCompleteContext) {
	const session = ctx.getSession();

	if (session.phase !== "FILING") return err(`Cannot complete filing: current phase is ${session.phase}.`);

	session.advance("COMPLETE");
	return ok("Filing complete. Review finished. Phase: COMPLETE.");
}

export function filingCompleteTool(ctx: FilingCompleteContext): ToolRegistrar {
	return {
		name: "filing_complete",
		register(server) {
			return server.registerTool(
				"filing_complete",
				{ description: "Complete the filing phase and the review. Transitions from FILING to COMPLETE." },
				() => handle(ctx),
			);
		},
	};
}
