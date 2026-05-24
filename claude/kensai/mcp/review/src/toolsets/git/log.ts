import { z } from "zod";

import { errFrom, ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	ref: z.string().optional().describe("Git ref to start from. Defaults to HEAD."),
	count: z.number().int().positive().optional().describe("Number of commits. Defaults to 10."),
});

type Input = z.infer<typeof inputSchema>;

async function handle(ctx: ToolContext, args: Input) {
	try {
		const entries = await ctx.rfs().git.log(args.ref ?? "HEAD", args.count ?? 10);
		return ok(JSON.stringify(entries));
	} catch (error) {
		return errFrom(error);
	}
}

export function logTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "log",
		register(server) {
			return server.registerTool(
				"log",
				{
					description: "Get commit history for the repository.",
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
