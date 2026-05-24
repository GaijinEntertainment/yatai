import { z } from "zod";

import { ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	dimension: z.string().optional().describe("Filter by review dimension."),
	status: z.enum(["pending", "confirmed", "rejected", "cancelled"]).optional().describe("Filter by status."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: ToolContext, args: Input) {
	const results = ctx.findings().list({ dimension: args.dimension, status: args.status });
	return ok(JSON.stringify(results));
}

export function findingsListTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "findings_list",
		register(server) {
			return server.registerTool(
				"findings_list",
				{
					description: "List all findings in the current review, with optional filtering.",
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
