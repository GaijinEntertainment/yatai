import { z } from "zod";

import { ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	summary: z.string().describe("Terse one-line summary of the observation."),
	detail: z.string().describe("Explanatory detail — what was observed, why it matters."),
	location: z.string().optional().describe("Code location — file:line or file:line_start-line_end."),
	category: z.string().optional().describe("Observation category (e.g. pattern, risk, dependency)."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: ToolContext, args: Input) {
	const id = ctx.grounding().createObservation(args.summary, args.detail, args.location, args.category);
	return ok(`Observation ${id} recorded.`);
}

export function observationCreateTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "observation_create",
		register(server) {
			return server.registerTool(
				"observation_create",
				{ description: "Record an observation during grounding exploration.", inputSchema },
				(args) => handle(ctx, args),
			);
		},
	};
}
