import { z } from "zod";

import { ok } from "../result.ts";
import type { ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	dimension: z.string().describe("Review dimension that was examined (e.g. security, performance)."),
	notes: z.string().optional().describe("Optional notes on what was checked."),
});

type Input = z.infer<typeof inputSchema>;

function handle(args: Input) {
	return ok(`Dimension ${args.dimension}: clean.`);
}

export function surfaceCleanTool(): ToolRegistrar {
	return {
		name: "surface_clean",
		register(server) {
			return server.registerTool(
				"surface_clean",
				{ description: "Report that a review dimension was examined and found clean (no findings).", inputSchema },
				(args) => handle(args),
			);
		},
	};
}
