import { z } from "zod";

import type { GroundingStorage } from "../../session/grounding-storage.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by SessionToolset for grounding_store. */
export interface GroundingStoreContext {
	grounding(): GroundingStorage;
}

/** grounding_store tool — persist grounding context during the grounding phase. */
export function groundingStoreTool(ctx: GroundingStoreContext): ToolRegistrar {
	const name = "grounding_store";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Persist grounding context — structured model of the change under review.",
					inputSchema: {
						summary: z
							.string()
							.describe("Long, explanatory description of what the change does — nature, scope, and mechanics."),
						integration_surface: z
							.string()
							.describe(
								"How the changed code connects to the rest of the codebase — callers, consumers, entry points.",
							),
						intent: z.string().describe("Author's stated and inferred intent behind the change."),
						hotspots: z
							.array(z.object({ location: z.string(), description: z.string() }))
							.optional()
							.describe("Areas warranting focused attention — complex logic, risky patterns."),
						blindspots: z
							.array(z.object({ location: z.string(), description: z.string() }))
							.optional()
							.describe("What was intentionally not explored and why."),
					},
				},
				async (args) => {
					ctx.grounding().storeResult({
						summary: args.summary,
						integrationSurface: args.integration_surface,
						intent: args.intent,
						hotspots: args.hotspots,
						blindspots: args.blindspots,
					});
					return { content: [{ type: "text", text: "Grounding context stored." }] };
				},
			);
		},
	};
}
