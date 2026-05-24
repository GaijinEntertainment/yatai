import { ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

function handle(ctx: ToolContext) {
	const storage = ctx.grounding();
	return ok(JSON.stringify({ grounding: storage.result(), observations: storage.observations() }));
}

export function groundingGetTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "grounding_get",
		register(server) {
			return server.registerTool(
				"grounding_get",
				{
					description: "Retrieve the stored grounding context. Available from SURFACING onward.",
					annotations: { readOnlyHint: true },
				},
				() => handle(ctx),
			);
		},
	};
}
