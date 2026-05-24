import { z } from "zod";

import type { FindingsStorage } from "../../session/findings-storage.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by FindingsToolset for findings_list. */
export interface ListContext {
	findings(): FindingsStorage;
}

/** findings_list tool — list all findings with optional filtering. */
export function findingsListTool(ctx: ListContext): ToolRegistrar {
	const name = "findings_list";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "List all findings in the current review, with optional filtering.",
					inputSchema: {
						dimension: z.string().optional().describe("Filter by review dimension."),
						status: z.enum(["pending", "confirmed", "rejected", "cancelled"]).optional().describe("Filter by status."),
					},
					annotations: { readOnlyHint: true },
				},
				async (args) => {
					const results = ctx.findings().list({ dimension: args.dimension, status: args.status });
					return { content: [{ type: "text", text: JSON.stringify(results) }] };
				},
			);
		},
	};
}
