import type { GroundingStorage } from "../../session/grounding-storage.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by SessionToolset for grounding_complete. */
export interface GroundingCompleteContext {
	grounding(): GroundingStorage;
}

/** grounding_complete tool — transition from GROUNDING to SURFACING phase. */
export function groundingCompleteTool(ctx: GroundingCompleteContext): ToolRegistrar {
	const name = "grounding_complete";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{ description: "Complete the grounding phase. Transitions from GROUNDING to SURFACING." },
				async () => {
					if (!ctx.grounding().hasContent()) {
						return {
							content: [{ type: "text", text: "Cannot complete: no grounding context stored." }],
							isError: true,
						};
					}
					return { content: [{ type: "text", text: "Grounding complete." }] };
				},
			);
		},
	};
}
