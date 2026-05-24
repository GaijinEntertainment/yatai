import { z } from "zod";

import type { FindingsStorage } from "../../session/findings-storage.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by FindingsToolset for finding_verdict. */
export interface VerdictContext {
	findings(): FindingsStorage;
}

/** finding_verdict tool — verdict a finding during proving (confirm or reject). */
export function findingVerdictTool(ctx: VerdictContext): ToolRegistrar {
	const name = "finding_verdict";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Issue a verdict on a finding during the proving phase.",
					inputSchema: {
						finding_id: z.string().describe("Finding ID (e.g. F1)."),
						verdict: z.enum(["confirmed", "rejected"]).describe("Whether the finding is confirmed or rejected."),
						reason: z.string().describe("Which gate it failed, or why it survived all gates."),
						severity: z
							.enum(["bug", "concern", "suggestion", "nitpick"])
							.optional()
							.describe("Final severity for confirmed findings."),
						blocking: z.boolean().optional().describe("Whether the change should not merge without addressing this."),
					},
				},
				async (args) => {
					ctx.findings().verdict(args.finding_id, args.verdict, args.reason, args.severity, args.blocking);
					return {
						content: [{ type: "text", text: `Finding ${args.finding_id}: ${args.verdict}.` }],
					};
				},
			);
		},
	};
}
