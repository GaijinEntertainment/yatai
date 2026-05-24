import { z } from "zod";

import { errFrom, ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const DEFAULT_COUNT = 10;
const SHORT_SHA = 7;

const inputSchema = z.object({
	count: z.number().int().positive().optional().describe("Number of commits. Defaults to 10."),
});

type Input = z.infer<typeof inputSchema>;

async function handle(ctx: ToolContext, args: Input) {
	const count = args.count ?? DEFAULT_COUNT;

	try {
		const entries = await ctx.rfs().git.log("HEAD", count);

		const header = `Recent commits on HEAD (${entries.length}):\n\n`;

		if (entries.length === 0) return ok(header + "[no commits]");

		const lines = entries.map((e) => `- ${e.sha.slice(0, SHORT_SHA)} ${e.subject}`);

		return ok(header + lines.join("\n") + "\n");
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
					description: "List recent commits on HEAD as short-sha + subject lines.",
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
