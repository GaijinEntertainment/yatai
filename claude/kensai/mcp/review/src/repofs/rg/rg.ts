import { execFile } from "node:child_process";
import { resolve } from "node:path";

const MAX_BUFFER = 50 * 1024 * 1024;
const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_CONTEXT_LINES = 5;
const DEFAULT_MAX_LINE_LENGTH = 1024;

/** Default directories excluded from search. Applied when {@link GrepOptions.excludeDirs} is omitted. */
export const DEFAULT_EXCLUDE_DIRS = [".git", "vendor", "node_modules", "dist", "build", "__pycache__"] as const;

/** Options for {@link grep}. */
export interface GrepOptions {
	/** Paths within root to search. Defaults to `["."]` (entire root). */
	target?: string[];
	/** Glob pattern to filter files (rg `--glob` syntax). */
	glob?: string;
	/** Case-insensitive matching. */
	caseInsensitive?: boolean;
	/** Maximum output lines (match + context, excluding separators). Default: 100. */
	maxResults?: number;
	/** Context lines around matches. Default: 5. */
	contextLines?: number;
	/** Maximum characters per output line before truncation. Default: 1024. */
	maxLineLength?: number;
	/** Directories to exclude via `--glob '!dir/'`. Defaults to {@link DEFAULT_EXCLUDE_DIRS}. Pass `[]` to disable. */
	excludeDirs?: string[];
}

/** Result from {@link grep}. */
export interface GrepResult {
	/** Raw rg output with `./` prefixes stripped, truncated to {@link GrepOptions.maxResults} lines. */
	output: string;
	/** Number of non-separator lines in the output (match + context). */
	lineCount: number;
	/** Whether the output was truncated due to {@link GrepOptions.maxResults}. */
	truncated: boolean;
}

/** Wraps rg CLI failures. Carries stderr in message and the original error as {@link Error.cause}. */
export class RgError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "RgError";
	}
}

/** Extracts major.minor.patch from `rg --version` output. Returns null on parse failure. */
export function parseRgVersion(output: string): { major: number; minor: number; patch: number } | null {
	const idx = output.indexOf("ripgrep ");
	if (idx < 0) return null;

	const ver = output.slice(idx + 8).split(/\s/)[0];
	if (!ver) return null;

	const parts = ver.split(".");
	if (!parts[0] || !parts[1] || !parts[2]) return null;

	const major = Number.parseInt(parts[0], 10);
	const minor = Number.parseInt(parts[1], 10);
	const patch = Number.parseInt(parts[2], 10);

	if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) return null;

	return { major, minor, patch };
}

/**
 * Post-processes raw rg stdout: strips `./` prefixes, applies max-results truncation,
 * and removes trailing group separators.
 */
export function processOutput(stdout: string, maxResults: number): GrepResult {
	if (!stdout) {
		return { output: "", lineCount: 0, truncated: false };
	}

	const trimmed = stdout.endsWith("\n") ? stdout.slice(0, -1) : stdout;
	const lines = trimmed.split("\n");
	const result: string[] = [];
	let lineCount = 0;
	let truncated = false;

	for (const rawLine of lines) {
		const line = rawLine.startsWith("./") ? rawLine.slice(2) : rawLine;
		const isSep = line === "--";

		if (!isSep) {
			if (lineCount >= maxResults) {
				truncated = true;
				break;
			}
			lineCount++;
		}

		result.push(line);
	}

	while (result.length > 0 && result[result.length - 1] === "--") {
		result.pop();
	}

	return {
		output: result.join("\n"),
		lineCount,
		truncated,
	};
}

let rgCliPromise: Promise<void> | null = null;

function ensureRgCli(): Promise<void> {
	rgCliPromise ??= checkRgCli();
	return rgCliPromise;
}

async function checkRgCli(): Promise<void> {
	try {
		await runExecFile("rg", ["--version"]);
	} catch (err) {
		throw new RgError("rg (ripgrep) binary not found in PATH; install ripgrep", { cause: err as Error });
	}
}

function buildArgs(pattern: string, options: GrepOptions): string[] {
	const contextLines = options.contextLines ?? DEFAULT_CONTEXT_LINES;
	const maxLineLength = options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;

	const args = [
		"--color=never",
		"--no-ignore",
		"--hidden",
		"--no-heading",
		"--with-filename",
		"--line-number",
		"--path-separator",
		"/",
		`--context=${contextLines}`,
		`--max-columns=${maxLineLength}`,
		"--max-columns-preview",
	];

	const excludeDirs = options.excludeDirs ?? DEFAULT_EXCLUDE_DIRS;
	for (const dir of excludeDirs) {
		args.push("--glob", `!${dir}/`);
	}

	if (options.caseInsensitive) {
		args.push("-i");
	}

	if (options.glob) {
		args.push("--glob", options.glob);
	}

	const targets = options.target?.length ? options.target : ["."];

	args.push("--", pattern, ...targets);

	return args;
}

/**
 * Searches file contents under {@link root} using ripgrep.
 * Accepts multiple search paths via {@link GrepOptions.target}.
 * Returns raw text output with match counts and truncation info.
 */
export async function grep(
	root: string,
	pattern: string,
	options: GrepOptions = {},
	signal?: AbortSignal,
): Promise<GrepResult> {
	await ensureRgCli();

	const absRoot = resolve(root);
	const args = buildArgs(pattern, options);

	let stdout: string;
	try {
		stdout = await runExecFile("rg", args, { cwd: absRoot, signal });
	} catch (err) {
		if (err instanceof RgError) {
			const cause = err.cause as { code?: number | string } | undefined;
			if (cause?.code === 1) {
				return { output: "", lineCount: 0, truncated: false };
			}
		}
		throw err;
	}

	return processOutput(stdout, options.maxResults ?? DEFAULT_MAX_RESULTS);
}

function runExecFile(cmd: string, args: string[], opts?: { cwd?: string; signal?: AbortSignal }): Promise<string> {
	return new Promise<string>((res, rej) => {
		execFile(
			cmd,
			args,
			{
				cwd: opts?.cwd,
				signal: opts?.signal,
				maxBuffer: MAX_BUFFER,
				encoding: "utf-8",
			},
			(err, stdout, stderr) => {
				if (err) {
					const msg = stderr?.trim();
					rej(new RgError(msg || `${cmd} failed`, { cause: err }));
					return;
				}
				res(stdout);
			},
		);
	});
}
