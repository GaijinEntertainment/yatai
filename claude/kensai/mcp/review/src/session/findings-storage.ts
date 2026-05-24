/** Severity levels, ordered by impact. */
export type Severity = "bug" | "concern" | "suggestion" | "nitpick";

/** Finding status in the review lifecycle. */
export type FindingStatus = "pending" | "confirmed" | "rejected" | "cancelled";

/** Prover's verdict on a finding — assigned during PROVING. */
export type Verdict = {
	/** Whether the finding is confirmed or rejected. */
	readonly result: "confirmed" | "rejected";
	/** Which gate it failed, or why it survived all gates. */
	readonly reason: string;
	/** Final severity reassessed by the prover (confirmed findings only). */
	readonly severity?: Severity;
	/** Whether the change should not merge without addressing this (confirmed findings only). */
	readonly blocking?: boolean;
};

/** A review finding — surfaced during SURFACING, verdicted during PROVING. */
export type Finding = {
	/** Stable ID — F1, F2, ... */
	readonly id: string;
	/** Review dimension this finding belongs to. */
	readonly dimension: string;
	/** Finding severity as assigned by the surfacer. */
	readonly severity: Severity;
	/** Code location — file:line or file:line_start-line_end. */
	readonly location: string;
	/** What is wrong — terse, with exact code quotes. */
	readonly concern: string;
	/** What was observed that proves this — tool results, line references. */
	readonly evidence: string;
	/** Current lifecycle status. */
	readonly status: FindingStatus;
	/** Prover's verdict — present after proving. */
	readonly verdict?: Verdict;
	/** Reason for cancellation (cancelled findings only). */
	readonly cancelReason?: string;
};

/** In-memory findings registry for a single review session. */
export class FindingsStorage {
	#findings = new Map<string, Finding>();
	#nextId = 1;

	/** Record a finding. Returns the assigned ID (F1, F2, ...). */
	surface(dimension: string, severity: Severity, location: string, concern: string, evidence: string): string {
		const id = `F${this.#nextId++}`;
		const finding: Finding = { id, dimension, severity, location, concern, evidence, status: "pending" };
		this.#findings.set(id, finding);
		return id;
	}

	/** Retract a finding. Only pending findings can be cancelled. */
	cancel(id: string, reason?: string): void {
		const f = this.#getOrThrow(id);
		if (f.status !== "pending") {
			throw new Error(`Cannot cancel ${id}: status is ${f.status}, expected pending`);
		}
		this.#findings.set(id, { ...f, status: "cancelled", cancelReason: reason });
	}

	/** Verdict a finding — confirm or reject. Only pending findings can be verdicted. */
	verdict(
		id: string,
		verdict: "confirmed" | "rejected",
		reason: string,
		severity?: Severity,
		blocking?: boolean,
	): void {
		const f = this.#getOrThrow(id);
		if (f.status !== "pending") {
			throw new Error(`Cannot verdict ${id}: status is ${f.status}, expected pending`);
		}
		this.#findings.set(id, {
			...f,
			status: verdict,
			verdict: {
				result: verdict,
				reason,
				severity: verdict === "confirmed" ? severity : undefined,
				blocking: verdict === "confirmed" ? blocking : undefined,
			},
		});
	}

	/** Get a finding by ID. */
	get(id: string): Finding | undefined {
		return this.#findings.get(id);
	}

	/** List findings, optionally filtered by dimension and/or status. */
	list(filter?: { dimension?: string; status?: FindingStatus }): Finding[] {
		let results = [...this.#findings.values()];
		if (filter?.dimension) {
			results = results.filter((f) => f.dimension === filter.dimension);
		}
		if (filter?.status) {
			results = results.filter((f) => f.status === filter.status);
		}
		return results;
	}

	/** Total number of findings (all statuses). */
	count(): number {
		return this.#findings.size;
	}

	#getOrThrow(id: string): Finding {
		const f = this.#findings.get(id);
		if (!f) throw new Error(`Finding ${id} not found`);
		return f;
	}
}
