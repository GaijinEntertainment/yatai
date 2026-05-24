import { z } from "zod";

import { ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	dimension: z.string().describe("Review dimension this finding belongs to."),
	location: z.string().describe("Code location — file:line or file:line_start-line_end."),
	concern: z.string().describe("What is wrong — terse, with exact code quotes."),
	evidence: z.string().describe("What was observed that proves this — tool results, line references."),
	severity: z.enum(["bug", "concern", "suggestion", "nitpick"]).describe("Finding severity."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: ToolContext, args: Input) {
	const id = ctx.findings().surface(args.dimension, args.severity, args.location, args.concern, args.evidence);
	return ok(`Finding ${id} recorded.`);
}

export function findingSurfaceTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "finding_surface",
		register(server) {
			return server.registerTool(
				"finding_surface",
				{ description: "Record a new finding during the surfacing phase.", inputSchema },
				(args) => handle(ctx, args),
			);
		},
	};
}
