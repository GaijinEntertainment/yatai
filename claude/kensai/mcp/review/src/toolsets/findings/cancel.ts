import { z } from "zod";

import { errFrom, ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	finding_id: z.string().describe("Finding ID (e.g. F1)."),
	reason: z.string().optional().describe("Reason for cancellation."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: ToolContext, args: Input) {
	try {
		ctx.findings().cancel(args.finding_id, args.reason);
	} catch (error) {
		return errFrom(error);
	}
	return ok(`Finding ${args.finding_id} cancelled.`);
}

export function findingCancelTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "finding_cancel",
		register(server) {
			return server.registerTool(
				"finding_cancel",
				{ description: "Retract a previously surfaced finding.", inputSchema },
				(args) => handle(ctx, args),
			);
		},
	};
}
