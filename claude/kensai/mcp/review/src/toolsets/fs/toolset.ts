import type { SessionDependant, ToolContext, ToolRegistrar } from "../types.ts";
import { findFilesTool } from "./find_files.ts";
import { grepTool } from "./grep.ts";
import { listDirTool } from "./list_dir.ts";
import { readFileTool } from "./read_file.ts";

/** Filesystem tools — stateless, receives context from session. */
export class FsToolset implements SessionDependant {
	tools(ctx: ToolContext): ToolRegistrar[] {
		return [readFileTool(ctx), findFilesTool(ctx), listDirTool(ctx), grepTool(ctx)];
	}
}
