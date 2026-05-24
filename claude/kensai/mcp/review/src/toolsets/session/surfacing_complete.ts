import type { ToolRegistrar } from "../types.ts";

/** surfacing_complete tool — complete the surfacing phase. */
export function surfacingCompleteTool(): ToolRegistrar {
	const name = "surfacing_complete";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{ description: "Complete the surfacing phase. Transitions to PROVING (or FILING if 0 findings)." },
				async () => {
					return { content: [{ type: "text", text: "[stub] surfacing_complete" }] };
				},
			);
		},
	};
}
