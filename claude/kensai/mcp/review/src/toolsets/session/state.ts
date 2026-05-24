import type { Session, ToolRegistrar } from "../types.ts";

/** Callbacks provided by SessionToolset for session_state. */
export interface StateContext {
	getSession(): Session | null;
}

/** session_state tool — returns the current session state. */
export function sessionStateTool(ctx: StateContext): ToolRegistrar {
	const name = "session_state";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "Returns the current session state.",
					annotations: { readOnlyHint: true },
				},
				async () => {
					const s = ctx.getSession();
					if (!s) throw new Error("No active session.");

					return {
						content: [
							{
								type: "text",
								text: `root=${s.root}, mode=${s.mode}, started=${s.startedAt.toISOString()}`,
							},
						],
					};
				},
			);
		},
	};
}
