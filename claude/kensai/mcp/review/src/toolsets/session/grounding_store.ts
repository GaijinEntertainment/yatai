import { z } from "zod";

import { errFrom, ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	summary: z.string().describe("Long, explanatory description of what the change does — nature, scope, and mechanics."),
	integration_surface: z
		.string()
		.describe("How the changed code connects to the rest of the codebase — callers, consumers, entry points."),
	intent: z.string().describe("Author's stated and inferred intent behind the change."),
	hotspots: z
		.array(z.object({ location: z.string(), description: z.string() }))
		.optional()
		.describe("Areas warranting focused attention — complex logic, risky patterns."),
	blindspots: z
		.array(z.object({ location: z.string(), description: z.string() }))
		.optional()
		.describe("What was intentionally not explored and why."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: ToolContext, args: Input) {
	try {
		ctx.grounding().storeResult({
			summary: args.summary,
			integrationSurface: args.integration_surface,
			intent: args.intent,
			hotspots: args.hotspots,
			blindspots: args.blindspots,
		});
	} catch (error) {
		return errFrom(error);
	}
	return ok("Grounding context stored.");
}

export function groundingStoreTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "grounding_store",
		register(server) {
			return server.registerTool(
				"grounding_store",
				{ description: "Persist grounding context — structured model of the change under review.", inputSchema },
				(args) => handle(ctx, args),
			);
		},
	};
}
