import type { ToolRegistrar } from "../types.ts";

/** proving_complete tool — complete the proving phase. */
export function provingCompleteTool(): ToolRegistrar {
	const name = "proving_complete";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{ description: "Complete the proving phase. Transitions from PROVING to FILING." },
				async () => {
					return { content: [{ type: "text", text: "[stub] proving_complete" }] };
				},
			);
		},
	};
}
