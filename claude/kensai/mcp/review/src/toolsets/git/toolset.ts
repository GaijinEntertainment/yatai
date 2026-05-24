import type { SessionDependant, ToolContext, ToolRegistrar } from "../types.ts";
import { changedFilesTool } from "./changed_files.ts";
import { diffFileTool } from "./diff_file.ts";
import { logTool } from "./log.ts";

/** Git tools — stateless, receives context from session. */
export class GitToolset implements SessionDependant {
	tools(ctx: ToolContext): ToolRegistrar[] {
		return [diffFileTool(ctx), changedFilesTool(ctx), logTool(ctx)];
	}
}
