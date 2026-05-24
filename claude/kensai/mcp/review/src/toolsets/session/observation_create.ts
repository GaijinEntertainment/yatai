import { z } from "zod";

import type { GroundingStorage } from "../../session/grounding-storage.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by SessionToolset for observation_create. */
export interface ObservationCreateContext {
	grounding(): GroundingStorage;
}

/** observation_create tool — record an observation during grounding exploration. */
export function observationCreateTool(ctx: ObservationCreateContext): ToolRegistrar {
	const name = "observation_create";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Record an observation during grounding exploration.",
					inputSchema: {
						summary: z.string().describe("Terse one-line summary of the observation."),
						detail: z.string().describe("Explanatory detail — what was observed, why it matters."),
						location: z.string().optional().describe("Code location — file:line or file:line_start-line_end."),
						category: z.string().optional().describe("Observation category (e.g. pattern, risk, dependency)."),
					},
				},
				async (args) => {
					const id = ctx.grounding().createObservation(args.summary, args.detail, args.location, args.category);
					return { content: [{ type: "text", text: `Observation ${id} recorded.` }] };
				},
			);
		},
	};
}
