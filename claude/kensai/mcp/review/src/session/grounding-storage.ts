/** An observation recorded during grounding exploration. */
export type Observation = {
	/** Stable ID — O1, O2, ... */
	readonly id: string;
	/** Terse one-line summary of the observation. */
	readonly summary: string;
	/** Arbitrary-length explanatory detail — what was observed, why it matters. */
	readonly detail: string;
	/** Code location — file:line or file:line_start-line_end. */
	readonly location?: string;
	/** Observation category (e.g. pattern, risk, dependency, coupling). */
	readonly category?: string;
	/** Whether the observation was disproved during investigation. */
	readonly cancelled: boolean;
	/** Why the observation was disproved. */
	readonly cancelReason?: string;
};

/** A location-anchored note — used for hotspots and blind spots. */
export type GroundingNote = {
	/** Code location — file, file:line, or file:line_start-line_end. */
	readonly location: string;
	/** Why this location matters (hotspot) or was skipped (blind spot). */
	readonly description: string;
};

/** Synthesized grounding result — the grounder's final model of the change. */
export type GroundingResult = {
	/** Long, explanatory description of what the change does — nature, scope, and mechanics. */
	readonly summary: string;
	/** How the changed code connects to the rest of the codebase — callers, consumers, entry points, registrations. */
	readonly integrationSurface: string;
	/** Author's stated and inferred intent behind the change. */
	readonly intent: string;
	/** Areas warranting focused attention — complex logic, risky patterns, layer divergences. */
	readonly hotspots?: readonly GroundingNote[];
	/** What was intentionally not explored and why. */
	readonly blindspots?: readonly GroundingNote[];
};

/** Grounding state for a review session — incremental observations + synthesized result. */
export class GroundingStorage {
	#observations = new Map<string, Observation>();
	#nextId = 1;
	#result: GroundingResult | null = null;

	/** Record an observation. Returns the assigned ID (O1, O2, ...). */
	createObservation(summary: string, detail: string, location?: string, category?: string): string {
		const id = `O${this.#nextId++}`;
		this.#observations.set(id, { id, summary, detail, location, category, cancelled: false });
		return id;
	}

	/** Cancel an observation — disproved during investigation. */
	cancelObservation(id: string, reason?: string): void {
		const o = this.#observations.get(id);
		if (!o) throw new Error(`Observation ${id} not found`);
		if (o.cancelled) throw new Error(`Observation ${id} already cancelled`);
		this.#observations.set(id, { ...o, cancelled: true, cancelReason: reason });
	}

	/** All observations (including cancelled). */
	observations(): Observation[] {
		return [...this.#observations.values()];
	}

	/** Store the synthesized grounding result. Throws if already stored — no restating. */
	storeResult(result: GroundingResult): void {
		if (this.#result) throw new Error("Grounding result already stored");
		this.#result = result;
	}

	/** Get the stored grounding result. */
	result(): GroundingResult | null {
		return this.#result;
	}

	/** Whether grounding result has been stored. */
	hasContent(): boolean {
		return this.#result !== null;
	}
}
