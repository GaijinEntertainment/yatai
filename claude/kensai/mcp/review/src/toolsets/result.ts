import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { RepoFs } from "../repofs/repofs.ts";

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

const PATH_MISS_SUGGESTIONS = 3;

/** Fuzzy-search the index for paths similar to `query`. Top matches bubble up naturally. */
export function suggestPaths(rfs: RepoFs, query: string): string[] {
	if (!query) return [];
	return rfs.findFiles(query, { maxResults: PATH_MISS_SUGGESTIONS });
}

/** Format path suggestions as a trailing block. Empty when no matches. */
export function formatSuggestions(matches: string[]): string {
	if (matches.length === 0) return "";
	return "\n\nDid you mean:\n" + matches.map((m) => `\t${m}`).join("\n") + "\n";
}
