import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Success response — one or more text content blocks. */
export function ok(...texts: string[]): CallToolResult {
	return { content: texts.map((text) => ({ type: "text" as const, text })) };
}

/** Error response — sets `isError: true` so the model sees the failure. */
export function err(...texts: string[]): CallToolResult {
	return { content: texts.map((text) => ({ type: "text" as const, text })), isError: true };
}

/** Error from a caught exception — extracts `.message` from Error instances. */
export function errFrom(error: unknown): CallToolResult {
	return err(error instanceof Error ? error.message : String(error));
}
