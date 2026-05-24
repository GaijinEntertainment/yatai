import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";

import { Session } from "../../session/session.ts";
import type { SessionDependant, ToolContext } from "../types.ts";
import { sessionEndTool } from "./end.ts";
import { filingCompleteTool } from "./filing_complete.ts";
import { groundingCompleteTool } from "./grounding_complete.ts";
import { groundingGetTool } from "./grounding_get.ts";
import { groundingStoreTool } from "./grounding_store.ts";
import { observationCancelTool } from "./observation_cancel.ts";
import { observationCreateTool } from "./observation_create.ts";
import { provingCompleteTool } from "./proving_complete.ts";
import { sessionStartTool } from "./start.ts";
import { sessionStateTool } from "./state.ts";
import { surfacingCompleteTool } from "./surfacing_complete.ts";

/** Session toolset — manages session lifecycle and controls dependant tool visibility. */
export class SessionToolset {
	readonly #dependants: SessionDependant[];
	readonly #handles = new Map<string, RegisteredTool>();
	readonly #ownToolNames: string[] = [];
	readonly #depToolNames: string[] = [];
	#session: Session | null = null;

	constructor(dependants: SessionDependant[]) {
		this.#dependants = dependants;
	}

	get session(): Session | null {
		return this.#session;
	}

	#require(): Session {
		if (!this.#session) throw new Error("No active session");
		return this.#session;
	}

	/** Register all tools (own + dependants) on the server. Dependant tools start disabled. */
	bind(server: McpServer): void {
		const ctx: ToolContext = {
			rfs: () => this.#require().rfs,
			findings: () => this.#require().findings,
			grounding: () => this.#require().grounding,
		};

		for (const reg of this.#ownTools(ctx)) {
			this.#handles.set(reg.name, reg.register(server));
			this.#ownToolNames.push(reg.name);
		}

		for (const dep of this.#dependants) {
			for (const reg of dep.tools(ctx)) {
				const handle = reg.register(server);
				handle.disable();
				this.#handles.set(reg.name, handle);
				this.#depToolNames.push(reg.name);
			}
		}
	}

	#ownTools(ctx: ToolContext) {
		return [
			sessionStartTool({
				getSession: () => this.#session,
				start: async (root, mode) => {
					this.#session = await Session.start(root, mode);
					this.#sync();
				},
			}),
			sessionStateTool({
				getSession: () => this.#session,
			}),
			sessionEndTool({
				getSession: () => this.#session,
				end: () => {
					this.#session = null;
					this.#sync();
				},
			}),
			observationCreateTool(ctx),
			observationCancelTool(ctx),
			groundingStoreTool(ctx),
			groundingGetTool(ctx),
			groundingCompleteTool(ctx),
			surfacingCompleteTool(),
			provingCompleteTool(),
			filingCompleteTool(),
		];
	}

	#sync(): void {
		const enabled = this.#enabledTools();
		for (const [name, handle] of this.#handles) {
			if (enabled.has(name)) {
				if (!handle.enabled) handle.enable();
			} else {
				if (handle.enabled) handle.disable();
			}
		}
	}

	#enabledTools(): Set<string> {
		const names = new Set(this.#ownToolNames);
		if (this.#session) {
			for (const n of this.#depToolNames) names.add(n);
		}
		return names;
	}
}
