import type { GroundingStorage } from "../../session/grounding-storage.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by SessionToolset for grounding_get. */
export interface GroundingGetContext {
	grounding(): GroundingStorage;
}

/** grounding_get tool — retrieve stored grounding context. */
export function groundingGetTool(ctx: GroundingGetContext): ToolRegistrar {
	const name = "grounding_get";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Retrieve the stored grounding context. Available from SURFACING onward.",
					annotations: { readOnlyHint: true },
				},
				async () => {
					const storage = ctx.grounding();
					const grounding = storage.result();
					const observations = storage.observations();
					return { content: [{ type: "text", text: JSON.stringify({ grounding, observations }) }] };
				},
			);
		},
	};
}
