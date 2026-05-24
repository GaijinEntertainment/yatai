import type { RepoFs } from "../../repofs/repofs.ts";
import type { ToolRegistrar } from "../types.ts";

/** Callbacks provided by GitToolset for changed_files. */
export interface ChangedFilesContext {
	rfs(): RepoFs;
}

/** changed_files tool — list files changed in the review. */
export function changedFilesTool(ctx: ChangedFilesContext): ToolRegistrar {
	const name = "changed_files";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "List files changed in the current review with status (added, modified, deleted, renamed).",
					annotations: { readOnlyHint: true },
				},
				async () => {
					ctx.rfs();
					return { content: [{ type: "text", text: "[stub] changed_files" }] };
				},
			);
		},
	};
}
