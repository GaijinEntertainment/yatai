import type { SessionDependant, ToolContext, ToolRegistrar } from "../types.ts";
import { findingCancelTool } from "./cancel.ts";
import { findingGetTool } from "./get.ts";
import { findingsListTool } from "./list.ts";
import { findingSurfaceTool } from "./surface.ts";
import { surfaceCleanTool } from "./surface_clean.ts";
import { findingVerdictTool } from "./verdict.ts";

/** Findings tools — stateless, receives context from session. */
export class FindingsToolset implements SessionDependant {
	tools(ctx: ToolContext): ToolRegistrar[] {
		return [
			findingSurfaceTool(ctx),
			surfaceCleanTool(),
			findingCancelTool(ctx),
			findingVerdictTool(ctx),
			findingsListTool(ctx),
			findingGetTool(ctx),
		];
	}
}
