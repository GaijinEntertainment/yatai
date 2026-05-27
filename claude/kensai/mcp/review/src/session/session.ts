import { createHash } from "node:crypto";
import path from "node:path";

import type { GitFileStat, GitLogEntry } from "../repofs/git/git.ts";
import { countFileLines } from "../repofs/pathindex/pathindex.ts";
import { RepoFs } from "../repofs/repofs.ts";
import { FindingsStorage } from "./findings-storage.ts";
import { GroundingStorage } from "./grounding-storage.ts";
import type { Instruction } from "./instructions.ts";
import { resolveInstructions } from "./instructions.ts";

/** Review mode — determines which changes are under review. */
export type ReviewMode = "committed" | "uncommitted" | "all";

/** Pipeline phase — strictly ordered, enforced by {@link Session.advance}. */
export type SessionPhase = "GROUNDING" | "SURFACING" | "PROVING" | "FILING" | "COMPLETE";

const VALID_TRANSITIONS: Record<SessionPhase, readonly SessionPhase[]> = {
	GROUNDING: ["SURFACING"],
	SURFACING: ["PROVING", "FILING"],
	PROVING: ["FILING"],
	FILING: ["COMPLETE"],
	COMPLETE: [],
};

/** A fetched diff for a single file, preserving changedFiles order. */
export interface FileDiff {
	readonly path: string;
	readonly content: string;
}

/** Per-file shape metrics from PathIndex. Covers all non-deleted changed files. */
export interface ManifestEntry {
	readonly path: string;
	readonly bytes: number;
	readonly lines: number;
	readonly maxLineLen: number;
	readonly binary: boolean;
}

export class SessionError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "SessionError";
	}
}

/** Active review session. Created via {@link Session.start}, holds all session state. */
export class Session {
	readonly id: string;
	readonly root: string;
	readonly mode: ReviewMode;
	readonly startedAt: Date;
	readonly rfs: RepoFs;
	readonly findings: FindingsStorage;
	readonly grounding: GroundingStorage;
	readonly commit: GitLogEntry | null;
	readonly changedFiles: readonly GitFileStat[];
	readonly manifest: readonly ManifestEntry[];
	readonly diffs: readonly FileDiff[];
	readonly instructions: readonly Instruction[];
	#phase: SessionPhase = "GROUNDING";

	get phase(): SessionPhase {
		return this.#phase;
	}

	/** Advance the session to the given phase. Throws {@link SessionError} if the transition is invalid. */
	advance(to: SessionPhase): void {
		const allowed = VALID_TRANSITIONS[this.#phase];
		if (!allowed.includes(to)) {
			throw new SessionError(`Cannot transition from ${this.#phase} to ${to}`);
		}
		this.#phase = to;
	}

	/** Initialize a review session — validates git, builds PathIndex, collects diffs and metadata. */
	static async start(root: string, mode: ReviewMode): Promise<Session> {
		const rfs = await RepoFs.open(root);
		const { base, head } = resolveRefs(mode);

		const [changedFiles, commit] = await Promise.all([
			rfs.git.changedFiles(base, head),
			mode !== "uncommitted" ? rfs.git.log("HEAD", 1).then((entries) => entries[0] ?? null) : Promise.resolve(null),
		]);

		const reviewable = filterReviewableFiles(changedFiles);
		const changedPaths = new Set(changedFiles.map((f) => f.path));

		const [manifest, diffs, instructions] = await Promise.all([
			buildManifest(rfs, changedFiles),
			fetchDiffs(rfs, base, head, reviewable),
			resolveInstructions(
				rfs,
				changedFiles.map((f) => f.path),
				changedPaths,
			),
		]);

		return new Session(root, mode, rfs, changedFiles, commit, manifest, diffs, instructions);
	}

	private constructor(
		root: string,
		mode: ReviewMode,
		rfs: RepoFs,
		changedFiles: GitFileStat[],
		commit: GitLogEntry | null,
		manifest: ManifestEntry[],
		diffs: FileDiff[],
		instructions: Instruction[],
	) {
		this.id = generateId();
		this.root = root;
		this.mode = mode;
		this.startedAt = new Date();
		this.rfs = rfs;
		this.findings = new FindingsStorage();
		this.grounding = new GroundingStorage();
		this.changedFiles = changedFiles;
		this.commit = commit;
		this.manifest = manifest;
		this.diffs = diffs;
		this.instructions = instructions;
	}
}

function generateId(): string {
	return createHash("sha1").update(String(Date.now())).digest("hex");
}

/** Returns base and head refs for the given review mode. */
export function resolveRefs(mode: ReviewMode): { base: string; head: string | null } {
	switch (mode) {
		case "committed":
			return { base: "HEAD~1", head: "HEAD" };
		case "uncommitted":
			return { base: "HEAD", head: null };
		case "all":
			return { base: "HEAD~1", head: null };
	}
}

// --- Diff filtering (ported from Go harness priming/diff.go) ---

const COLLAPSED_PREFIXES = ["vendor/", "node_modules/", "dist/", "build/", "__pycache__/", ".git/"];

const SKIP_DIFF_EXACT = [
	"go.sum",
	"yarn.lock",
	"package-lock.json",
	"pnpm-lock.yaml",
	"Cargo.lock",
	"Gemfile.lock",
	"composer.lock",
	"poetry.lock",
	"Pipfile.lock",
];

const SKIP_DIFF_SUFFIXES = [".pb.go", ".gen.go", "_generated.go", ".min.js", ".min.css", ".map"];

/** Reports whether a file should be excluded from diff priming. Vendor, lock, and generated files are skipped. */
export function shouldSkipDiff(filePath: string): boolean {
	for (const prefix of COLLAPSED_PREFIXES) {
		if (filePath.startsWith(prefix)) return true;
	}

	for (const pattern of SKIP_DIFF_EXACT) {
		if (filePath === pattern || filePath.endsWith(`/${pattern}`)) return true;
	}

	for (const suffix of SKIP_DIFF_SUFFIXES) {
		if (filePath.endsWith(suffix)) return true;
	}

	return false;
}

/** Returns only files that should receive diffs — excludes deleted, vendor, lock, and generated. */
export function filterReviewableFiles(files: readonly GitFileStat[]): GitFileStat[] {
	return files.filter((f) => f.status !== "deleted" && !shouldSkipDiff(f.path));
}

/** Builds per-file shape metrics for all non-deleted changed files. Counts lines on demand (only for changed files). */
async function buildManifest(rfs: RepoFs, files: readonly GitFileStat[]): Promise<ManifestEntry[]> {
	const candidates: Array<{ path: string; entry: { size: number; isBinary: boolean } }> = [];

	for (const f of files) {
		if (f.status === "deleted") continue;
		const entry = rfs.index.get(f.path);
		if (!entry || entry.type !== "file") continue;
		candidates.push({ path: f.path, entry });
	}

	const results = await Promise.all(
		candidates.map(async ({ path: filePath, entry }) => {
			if (entry.isBinary) {
				return { path: filePath, bytes: entry.size, lines: 0, maxLineLen: 0, binary: true };
			}
			try {
				const lc = await countFileLines(path.resolve(rfs.root, filePath));
				return {
					path: filePath,
					bytes: entry.size,
					lines: lc.lineCount,
					maxLineLen: lc.maxLineLen,
					binary: lc.isBinary,
				};
			} catch {
				return { path: filePath, bytes: entry.size, lines: 0, maxLineLen: 0, binary: false };
			}
		}),
	);

	return results;
}

/**
 * Fetches unified diffs for all reviewable files in parallel.
 * Order matches the input files array. Fatal on any fetch failure.
 */
async function fetchDiffs(
	rfs: RepoFs,
	base: string,
	head: string | null,
	files: readonly GitFileStat[],
): Promise<FileDiff[]> {
	const settled = await Promise.allSettled(
		files.map(async (f) => {
			const content = await rfs.git.diffFile(base, head, f.path, 25);
			return { path: f.path, content };
		}),
	);

	const failures: string[] = [];
	const diffs: FileDiff[] = [];

	for (let i = 0; i < settled.length; i++) {
		const result = settled[i]!;
		if (result.status === "rejected") {
			failures.push(files[i]!.path);
		} else if (result.value.content) {
			diffs.push(result.value);
		}
	}

	if (failures.length > 0) {
		throw new SessionError(`diff fetch failed for ${failures.length} file(s): ${failures.join(", ")}`);
	}

	return diffs;
}
