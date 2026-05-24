import { z } from "zod";

import { resolveRefs } from "../../session/session.ts";
import { errFrom, ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	path: z.string().describe("File path relative to the repository root."),
	context_lines: z.number().int().nonnegative().optional().describe("Context lines around changes. Defaults to 3."),
});

type Input = z.infer<typeof inputSchema>;

async function handle(ctx: ToolContext, args: Input) {
	const session = ctx.session();
	const { base, head } = resolveRefs(session.mode);

	try {
		const diff = await ctx.rfs().git.diffFile(base, head, args.path, args.context_lines ?? 3);
		if (!diff) return ok("No changes.");
		return ok(diff);
	} catch (error) {
		return errFrom(error);
	}
}

export function diffFileTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "diff_file",
		register(server) {
			return server.registerTool(
				"diff_file",
				{
					description: "Get the annotated diff for a single file in the review.",
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
