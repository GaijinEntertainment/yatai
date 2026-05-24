/** Manages key-value grounding context for a single review session. */
export interface GroundingStorage {
	/** Store a grounding context entry. */
	store(key: string, content: string): void;
	/** Get a single entry by key. */
	get(key: string): string | undefined;
	/** Get all entries. */
	entries(): ReadonlyMap<string, string>;
	/** Whether any grounding context has been stored. */
	hasContent(): boolean;
}
