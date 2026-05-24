import { z } from "zod";

import type { FindingsStorage } from "../../session/findings-storage.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by FindingsToolset for finding_cancel. */
export interface CancelContext {
	findings(): FindingsStorage;
}

/** finding_cancel tool — retract a previously surfaced finding. */
export function findingCancelTool(ctx: CancelContext): ToolRegistrar {
	const name = "finding_cancel";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Retract a previously surfaced finding.",
					inputSchema: {
						finding_id: z.string().describe("Finding ID (e.g. F1)."),
						reason: z.string().optional().describe("Reason for cancellation."),
					},
				},
				async (args) => {
					ctx.findings().cancel(args.finding_id, args.reason);
					return { content: [{ type: "text", text: `Finding ${args.finding_id} cancelled.` }] };
				},
			);
		},
	};
}
