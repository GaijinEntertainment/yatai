import { z } from "zod";

import { errFrom, ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	finding_id: z.string().describe("Finding ID (e.g. F1)."),
	verdict: z.enum(["confirmed", "rejected"]).describe("Whether the finding is confirmed or rejected."),
	reason: z.string().describe("Which gate it failed, or why it survived all gates."),
	severity: z
		.enum(["bug", "concern", "suggestion", "nitpick"])
		.optional()
		.describe("Final severity for confirmed findings."),
	blocking: z.boolean().optional().describe("Whether the change should not merge without addressing this."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: ToolContext, args: Input) {
	try {
		ctx.findings().verdict(args.finding_id, args.verdict, args.reason, args.severity, args.blocking);
	} catch (error) {
		return errFrom(error);
	}
	return ok(`Finding ${args.finding_id}: ${args.verdict}.`);
}

export function findingVerdictTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "finding_verdict",
		register(server) {
			return server.registerTool(
				"finding_verdict",
				{ description: "Issue a verdict on a finding during the proving phase.", inputSchema },
				(args) => handle(ctx, args),
			);
		},
	};
}
