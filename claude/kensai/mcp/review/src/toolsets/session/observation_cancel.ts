import { z } from "zod";

import { errFrom, ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	observation_id: z.string().describe("Observation ID (e.g. O1)."),
	reason: z.string().optional().describe("Why the observation was disproved."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: ToolContext, args: Input) {
	try {
		ctx.grounding().cancelObservation(args.observation_id, args.reason);
	} catch (error) {
		return errFrom(error);
	}
	return ok(`Observation ${args.observation_id} cancelled.`);
}

export function observationCancelTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "observation_cancel",
		register(server) {
			return server.registerTool(
				"observation_cancel",
				{ description: "Retract an observation that was disproved during investigation.", inputSchema },
				(args) => handle(ctx, args),
			);
		},
	};
}
