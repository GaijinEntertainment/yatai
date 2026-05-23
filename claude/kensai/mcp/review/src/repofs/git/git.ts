import { execFile } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

/** Per-file change stats from a two-revision diff. */
export interface GitFileStat {
	path: string;
	status: "added" | "modified" | "deleted";
	/** Line additions. 0 for binary files. */
	additions: number;
	/** Line deletions. 0 for binary files. */
	deletions: number;
}

/** Single commit from {@link Repo.log}. */
export interface GitLogEntry {
	/** Full 40-character hex SHA. */
	sha: string;
	/** First line of the commit message. */
	subject: string;
	/** Message body after the subject line, trimmed. Empty string when no body. */
	body: string;
	/** Author name. */
	author: string;
	/** Author email address. */
	authorEmail: string;
	/** Author date (ISO 8601 parsed). */
	date: Date;
}

/** Wraps git CLI failures. Carries stderr in message and the original error as {@link Error.cause}. */
export class GitError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "GitError";
	}
}

/** Extracts major.minor from `git --version` output. Returns null on parse failure. */
export function parseGitVersion(output: string): { major: number; minor: number } | null {
	const idx = output.indexOf("version ");
	if (idx < 0) return null;

	const ver = output.slice(idx + 8).split(/\s/)[0];
	if (!ver) return null;

	const parts = ver.split(".");
	if (!parts[0] || !parts[1]) return null;

	const major = Number.parseInt(parts[0], 10);
	const minor = Number.parseInt(parts[1], 10);

	if (Number.isNaN(major) || Number.isNaN(minor)) return null;

	return { major, minor };
}

/** Extracts the new-file starting line number from a unified diff hunk header (`@@ ... +N,M @@`). Returns 1 when absent or zero. */
export function parseHunkStart(header: string): number {
	const plusIdx = header.indexOf("+");
	if (plusIdx < 0) return 1;

	let n = 0;
	for (let i = plusIdx + 1; i < header.length; i++) {
		const c = header.charCodeAt(i);
		if (c < 0x30 || c > 0x39) break;
		n = n * 10 + (c - 0x30);
	}

	return n || 1;
}

/**
 * Annotates raw unified diff with new-file line numbers.
 * Context: `%4d   <content>`, additions: `%4d + <content>`, deletions: `   -   <content>`.
 */
export function annotateDiff(raw: string): string {
	const parts: string[] = [];
	let lineB = 0;
	let inHunk = false;

	for (const line of raw.split("\n")) {
		if (line.startsWith("--- ") || line.startsWith("+++ ")) {
			parts.push(line, "\n");
			inHunk = false;
		} else if (line.startsWith("@@")) {
			lineB = parseHunkStart(line);
			inHunk = true;
			parts.push(line, "\n");
		} else if (!inHunk) {
			parts.push(line, "\n");
		} else if (line.startsWith("-")) {
			parts.push(`   -   ${line.slice(1)}\n`);
		} else if (line.startsWith("+")) {
			parts.push(`${String(lineB).padStart(4)} + ${line.slice(1)}\n`);
			lineB++;
		} else {
			if (line.length > 0) {
				parts.push(`${String(lineB).padStart(4)}   ${line.startsWith(" ") ? line.slice(1) : line}\n`);
			}
			lineB++;
		}
	}

	return parts.join("");
}

/** Counts addition and deletion lines in raw unified diff output, skipping file headers. */
export function countDiffLines(diff: string): { additions: number; deletions: number } {
	let additions = 0;
	let deletions = 0;

	for (const line of diff.split("\n")) {
		if (line.startsWith("+++ ") || line.startsWith("--- ")) continue;
		if (line.startsWith("+")) additions++;
		else if (line.startsWith("-")) deletions++;
	}

	return { additions, deletions };
}

let gitCliPromise: Promise<void> | null = null;

function ensureGitCli(): Promise<void> {
	gitCliPromise ??= checkGitCli();
	return gitCliPromise;
}

async function checkGitCli(): Promise<void> {
	let output: string;
	try {
		output = await runExecFile("git", ["--version"]);
	} catch (err) {
		throw new GitError("git binary not found in PATH; install git >= 2.0", { cause: err as Error });
	}

	const version = parseGitVersion(output);
	if (!version) throw new GitError(`unable to parse git version from: ${output.trim()}`);
	if (version.major < 2) {
		throw new GitError(`git ${version.major}.${version.minor} is too old; minimum required version is 2.0`);
	}
}

function runExecFile(
	cmd: string,
	args: string[],
	opts?: { cwd?: string; signal?: AbortSignal; env?: NodeJS.ProcessEnv },
): Promise<string> {
	return new Promise<string>((res, rej) => {
		execFile(
			cmd,
			args,
			{
				cwd: opts?.cwd,
				signal: opts?.signal,
				env: opts?.env,
				maxBuffer: 50 * 1024 * 1024,
				encoding: "utf-8",
			},
			(err, stdout, stderr) => {
				if (err) {
					const msg = stderr?.trim();
					rej(new GitError(msg || `${cmd} ${args[0]} failed`, { cause: err }));
					return;
				}
				res(stdout);
			},
		);
	});
}

/**
 * Thin wrapper over a local git repository accessed via the git CLI.
 * All operations use `execFile` with argument arrays and `GIT_LITERAL_PATHSPECS=1`.
 */
export class Repo {
	readonly #path: string;

	private constructor(path: string) {
		this.#path = path;
	}

	/** Opens a git repository at the given path. Validates the repo exists and git CLI is >= 2.0. */
	static async open(path: string, signal?: AbortSignal): Promise<Repo> {
		await ensureGitCli();
		const absPath = resolve(path);
		const repo = new Repo(absPath);
		try {
			await repo.#exec(["rev-parse", "--git-dir"], signal);
		} catch (err) {
			throw new GitError(`not a git repository: ${absPath}`, { cause: err as Error });
		}
		return repo;
	}

	/** Absolute path to the repository root. */
	get path(): string {
		return this.#path;
	}

	/** Returns the unified diff for a single file between two revisions. Empty string when unchanged. */
	async diffFile(
		base: string,
		head: string,
		filePath: string,
		contextLines = 0,
		signal?: AbortSignal,
	): Promise<string> {
		const args = ["diff", "--no-color", "--no-ext-diff"];
		if (contextLines > 0) args.push(`-U${contextLines}`);
		args.push(`${base}..${head}`, "--", filePath);
		return this.#exec(args, signal);
	}

	/** Returns per-file change stats between two revisions. Uses `--no-renames` (renames → add + delete). */
	async changedFiles(base: string, head: string, signal?: AbortSignal): Promise<GitFileStat[]> {
		const range = `${base}..${head}`;
		const [statusOut, numstatOut] = await Promise.all([
			this.#exec(["diff", "--name-status", "--no-renames", range], signal),
			this.#exec(["diff", "--numstat", "--no-renames", range], signal),
		]);

		const statuses = parseNameStatus(statusOut);
		const counts = parseNumstat(numstatOut);

		return statuses.map((s) => ({
			path: s.path,
			status: s.status,
			additions: counts.get(s.path)?.adds ?? 0,
			deletions: counts.get(s.path)?.dels ?? 0,
		}));
	}

	/** Returns up to {@link count} commits starting from {@link ref}. */
	async log(ref: string, count: number, signal?: AbortSignal): Promise<GitLogEntry[]> {
		const out = await this.#exec(
			["log", `--format=%H%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%b%x1e`, "-n", String(count), ref],
			signal,
		);

		const entries: GitLogEntry[] = [];
		for (const record of out.split("\x1e")) {
			const trimmed = record.trim();
			if (!trimmed) continue;
			const fields = trimmed.split("\x1f");
			if (fields.length < 6) continue;
			entries.push({
				sha: fields[0]!,
				subject: fields[1]!,
				author: fields[2]!,
				authorEmail: fields[3]!,
				date: new Date(fields[4]!),
				body: fields.slice(5).join("\x1f").trim(),
			});
		}

		return entries;
	}

	async #exec(args: string[], signal?: AbortSignal): Promise<string> {
		return runExecFile("git", args, {
			cwd: this.#path,
			signal,
			env: { ...process.env, GIT_LITERAL_PATHSPECS: "1" },
		});
	}
}

type FileStatus = "added" | "modified" | "deleted";

function parseNameStatus(output: string): Array<{ path: string; status: FileStatus }> {
	const entries: Array<{ path: string; status: FileStatus }> = [];
	for (const line of output.split("\n")) {
		if (!line) continue;
		const tabIdx = line.indexOf("\t");
		if (tabIdx < 0) continue;
		entries.push({
			status: mapGitStatus(line.slice(0, tabIdx)),
			path: line.slice(tabIdx + 1),
		});
	}
	return entries;
}

function mapGitStatus(code: string): FileStatus {
	if (!code) return "modified";
	switch (code[0]) {
		case "A":
			return "added";
		case "D":
			return "deleted";
		default:
			return "modified";
	}
}

function parseNumstat(output: string): Map<string, { adds: number; dels: number }> {
	const counts = new Map<string, { adds: number; dels: number }>();
	for (const line of output.split("\n")) {
		if (!line) continue;
		const parts = line.split("\t");
		if (parts.length !== 3) continue;
		const adds = Number.parseInt(parts[0]!, 10) || 0;
		const dels = Number.parseInt(parts[1]!, 10) || 0;
		counts.set(parts[2]!, { adds, dels });
	}
	return counts;
}
