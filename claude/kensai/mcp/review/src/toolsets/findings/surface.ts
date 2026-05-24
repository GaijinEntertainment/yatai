import { z } from "zod";

import type { FindingsStorage } from "../../session/findings-storage.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by FindingsToolset for finding_surface. */
export interface SurfaceContext {
	findings(): FindingsStorage;
}

/** finding_surface tool — record a new finding during surfacing. */
export function findingSurfaceTool(ctx: SurfaceContext): ToolRegistrar {
	const name = "finding_surface";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Record a new finding during the surfacing phase.",
					inputSchema: {
						dimension: z.string().describe("Review dimension this finding belongs to."),
						location: z.string().describe("Code location — file:line or file:line_start-line_end."),
						concern: z.string().describe("What is wrong — terse, with exact code quotes."),
						evidence: z.string().describe("What was observed that proves this — tool results, line references."),
						severity: z.enum(["bug", "concern", "suggestion", "nitpick"]).describe("Finding severity."),
					},
				},
				async (args) => {
					const id = ctx.findings().surface(args.dimension, args.severity, args.location, args.concern, args.evidence);
					return { content: [{ type: "text", text: `Finding ${id} recorded.` }] };
				},
			);
		},
	};
}
