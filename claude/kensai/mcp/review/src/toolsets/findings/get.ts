import { z } from "zod";

import type { FindingsStorage } from "../../session/findings-storage.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by FindingsToolset for finding_get. */
export interface GetContext {
	findings(): FindingsStorage;
}

/** finding_get tool — get a single finding by ID. */
export function findingGetTool(ctx: GetContext): ToolRegistrar {
	const name = "finding_get";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Get a single finding by its ID.",
					inputSchema: {
						finding_id: z.string().describe("Finding ID (e.g. F1)."),
					},
					annotations: { readOnlyHint: true },
				},
				async (args) => {
					const f = ctx.findings().get(args.finding_id);
					if (!f) return { content: [{ type: "text", text: `Finding ${args.finding_id} not found.` }], isError: true };
					return { content: [{ type: "text", text: JSON.stringify(f) }] };
				},
			);
		},
	};
}
