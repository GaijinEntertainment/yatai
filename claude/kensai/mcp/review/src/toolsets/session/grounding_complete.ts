import { ok, err } from "../result.ts";
import type { Session, ToolRegistrar } from "../types.ts";

interface GroundingCompleteContext {
	getSession(): Session;
}

function handle(ctx: GroundingCompleteContext) {
	const session = ctx.getSession();

	if (session.phase !== "GROUNDING") return err(`Cannot complete grounding: current phase is ${session.phase}.`);
	if (!session.grounding.hasContent()) return err("Cannot complete grounding: no grounding context stored.");

	session.advance("SURFACING");
	return ok("Grounding complete. Phase: SURFACING.");
}

export function groundingCompleteTool(ctx: GroundingCompleteContext): ToolRegistrar {
	return {
		name: "grounding_complete",
		register(server) {
			return server.registerTool(
				"grounding_complete",
				{ description: "Complete the grounding phase. Transitions from GROUNDING to SURFACING." },
				() => handle(ctx),
			);
		},
	};
}
