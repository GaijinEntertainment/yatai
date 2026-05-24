import { z } from "zod";

import { ok, err } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	finding_id: z.string().describe("Finding ID (e.g. F1)."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: ToolContext, args: Input) {
	const f = ctx.findings().get(args.finding_id);
	if (!f) return err(`Finding ${args.finding_id} not found.`);
	return ok(JSON.stringify(f));
}

export function findingGetTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "finding_get",
		register(server) {
			return server.registerTool(
				"finding_get",
				{
					description: "Get a single finding by its ID.",
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
