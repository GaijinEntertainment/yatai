import type { ToolRegistrar } from "../types.ts";

/** filing_complete tool — complete the review. */
export function filingCompleteTool(): ToolRegistrar {
	const name = "filing_complete";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{ description: "Complete the filing phase and the review. Transitions from FILING to COMPLETE." },
				async () => {
					return { content: [{ type: "text", text: "[stub] filing_complete" }] };
				},
			);
		},
	};
}
