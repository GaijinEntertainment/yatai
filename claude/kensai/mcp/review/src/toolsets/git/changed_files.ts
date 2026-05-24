import { ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

function handle(ctx: ToolContext) {
	const session = ctx.session();
	return ok(JSON.stringify(session.changedFiles));
}

export function changedFilesTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "changed_files",
		register(server) {
			return server.registerTool(
				"changed_files",
				{
					description: "List files changed in the current review with status (added, modified, deleted, renamed).",
					annotations: { readOnlyHint: true },
				},
				() => handle(ctx),
			);
		},
	};
}
