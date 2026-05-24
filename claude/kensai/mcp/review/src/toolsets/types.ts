import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { RepoFs } from "../repofs/repofs.ts";
import type { FindingsStorage } from "../session/findings-storage.ts";
import type { GroundingStorage } from "../session/grounding-storage.ts";
import type { Session } from "../session/session.ts";

export type { Session, SessionPhase } from "../session/session.ts";

/** A deferred tool registration — name + factory that registers on a server. */
export interface ToolRegistrar {
	readonly name: string;
	register(server: McpServer): RegisteredTool;
}

/** Session-level context passed to dependant toolsets during bind. Lazy accessors — called at tool invocation time. */
export interface ToolContext {
	session(): Session;
	rfs(): RepoFs;
	findings(): FindingsStorage;
	grounding(): GroundingStorage;
}

/** A toolset whose tools are registered and managed by the session. Stateless — all state lives in SessionToolset. */
export interface SessionDependant {
	tools(ctx: ToolContext): ToolRegistrar[];
}
