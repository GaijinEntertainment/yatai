import { z } from "zod";

import type { GroundingStorage } from "../../session/grounding-storage.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by SessionToolset for observation_cancel. */
export interface ObservationCancelContext {
	grounding(): GroundingStorage;
}

/** observation_cancel tool — retract an observation disproved during investigation. */
export function observationCancelTool(ctx: ObservationCancelContext): ToolRegistrar {
	const name = "observation_cancel";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Retract an observation that was disproved during investigation.",
					inputSchema: {
						observation_id: z.string().describe("Observation ID (e.g. O1)."),
						reason: z.string().optional().describe("Why the observation was disproved."),
					},
				},
				async (args) => {
					ctx.grounding().cancelObservation(args.observation_id, args.reason);
					return { content: [{ type: "text", text: `Observation ${args.observation_id} cancelled.` }] };
				},
			);
		},
	};
}
