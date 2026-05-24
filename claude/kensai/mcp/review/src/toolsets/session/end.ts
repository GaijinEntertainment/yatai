import type { Session, ToolRegistrar } from "../types.ts";

/** Callbacks provided by SessionToolset for session_end. */
export interface EndContext {
	getSession(): Session | null;
	end(): void;
}

/** session_end tool — ends the active review session. */
export function sessionEndTool(ctx: EndContext): ToolRegistrar {
	const name = "session_end";

	return {
		name,
		register(server) {
			return server.registerTool(
				name,
				{
					description: "End the active review session.",
				},
				async () => {
					if (!ctx.getSession()) throw new Error("No active session.");
					ctx.end();

					return { content: [{ type: "text", text: "Session ended." }] };
				},
			);
		},
	};
}
