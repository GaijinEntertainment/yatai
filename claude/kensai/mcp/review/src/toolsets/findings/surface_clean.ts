import { z } from "zod";

import type { ToolRegistrar } from "../types.ts";

/** surface_clean tool — report that a review dimension was examined and found clean. */
export function surfaceCleanTool(): ToolRegistrar {
	const name = "surface_clean";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Report that a review dimension was examined and found clean (no findings).",
					inputSchema: {
						dimension: z.string().describe("Review dimension that was examined (e.g. security, performance)."),
						notes: z.string().optional().describe("Optional notes on what was checked."),
					},
				},
				async (args) => {
					return { content: [{ type: "text", text: `[stub] surface_clean: dimension=${args.dimension}` }] };
				},
			);
		},
	};
}
