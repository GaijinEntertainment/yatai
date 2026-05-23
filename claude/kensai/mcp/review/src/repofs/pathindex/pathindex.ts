import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path/posix";

import fuzzysort from "fuzzysort";
import picomatch from "picomatch";

import { ErrBinaryContent, LineIter } from "../lineiter/lineiter.ts";

export type IndexEntryFile = {
	type: "file";
	name: string;
	size: number;
	/** Total number of lines. 0 for binary files. */
	lineCount: number;
	/** Byte length of the longest line (excluding `\n`). 0 for binary/empty files. */
	maxLineLen: number;
	/** True when the file's leading bytes contain a null byte. */
	isBinary: boolean;
};

export type IndexEntryDir = {
	type: "dir";
	name: string;
	children: IndexEntry[];
};

export type IndexEntrySymlink = {
	type: "symlink";
	name: string;
	/** Raw readlink result — may be relative to the symlink's parent directory. */
	target: string;
	/** What the symlink resolves to. "unknown" for dangling symlinks. */
	targetType: "file" | "dir" | "unknown";
	/** Target's byte size if targetType is "file", 0 otherwise. */
	size: number;
};

export type IndexEntry = IndexEntryFile | IndexEntryDir | IndexEntrySymlink;

export type FilterOptions = {
	/** Keep paths matching at least one glob. No slash → matchBase (any depth). */
	includes?: string[];
	/** Drop paths matching any glob. No slash → matchBase (any depth). */
	excludes?: string[];
	maxResults?: number;
};

/**
 * Tree-structured file index. Built once via {@link PathIndex.new}, immutable after construction.
 * Paths are relative to root, forward slashes on all platforms.
 */
export class PathIndex {
	readonly absRoot: string;
	readonly root: IndexEntryDir = { type: "dir", name: "", children: [] };
	readonly paths: string[] = [];
	readonly #entries = new Map<string, IndexEntry>();
	readonly #fdPool = new Pool(256);

	private constructor(rootPath: string) {
		this.absRoot = path.resolve(rootPath);
	}

	/** Paths ending with "/" are directories; without are files. */
	static from(rootPath: string, paths: string[]): PathIndex {
		const ix = new PathIndex(rootPath);

		for (let p of paths.toSorted()) {
			const segments = p.split("/");
			let file: string | undefined;

			if (p.endsWith("/")) {
				segments.pop();
				p = p.slice(0, -1);
			} else {
				file = segments.pop();
			}

			let parent = ix.root;
			for (const [i, name] of segments.entries()) {
				if (!name) continue;
				const relPath = segments.slice(0, i + 1).join("/");
				let dir = ix.#entries.get(relPath) as IndexEntryDir | undefined;

				if (!dir) {
					dir = { type: "dir", name, children: [] };
					parent.children.push(dir);
					ix.#entries.set(relPath, dir);
				}

				parent = dir;
			}

			if (file) {
				const entry: IndexEntryFile = {
					type: "file",
					name: file,
					size: 0,
					lineCount: 0,
					maxLineLen: 0,
					isBinary: false,
				};
				parent.children.push(entry);
				ix.#entries.set(p, entry);
			}

			ix.paths.push(p);
		}

		return ix;
	}

	/** Walk the filesystem tree rooted at `rootPath` and return a tree-structured index. */
	static async new(rootPath: string, signal?: AbortSignal): Promise<PathIndex> {
		const ix = new PathIndex(rootPath);
		ix.root.children = (await ix.#walkDir("", signal)).children;
		ix.paths.sort();
		return ix;
	}

	get length(): number {
		return this.paths.length;
	}

	/** O(1) lookup of an entry by its relative path. */
	get(entryPath: string): IndexEntry | undefined {
		return this.#entries.get(entryPath);
	}

	/** Filter paths by include/exclude globs. */
	globSearch(opts?: FilterOptions): string[] {
		return capResults(applyGlobFilters(this.paths, opts), opts?.maxResults);
	}

	/** Multi-word fuzzy search with optional glob pre-filtering. Each word narrows survivors of the previous. */
	fuzzySearch(pattern: string, opts?: FilterOptions): string[] {
		const source = applyGlobFilters(this.paths, opts);

		const words = pattern.split(/\s+/).filter(Boolean);
		if (words.length === 0) return capResults(source, opts?.maxResults);

		let current = source;

		for (const word of words) {
			if (current.length === 0) break;
			const matches = fuzzysort.go(word, current);
			current = matches.map((m) => m.target);
		}

		return capResults(current, opts?.maxResults);
	}

	/** O(1) directory lookup by relative path. `"."` or `""` returns root. */
	dir(dirPath: string): IndexEntryDir | undefined {
		const normalized = path.join(dirPath || ".", ".");
		if (normalized === ".") return this.root;
		const entry = this.#entries.get(normalized);
		return entry?.type === "dir" ? entry : undefined;
	}

	/** Parallel recursive walk — all children (subdirs + file stats) dispatched via Promise.all per directory. */
	async #walkDir(dir: string, signal?: AbortSignal): Promise<IndexEntryDir> {
		signal?.throwIfAborted();

		const dirEntries = await fs.readdir(path.resolve(this.absRoot, dir), { withFileTypes: true });
		const dirEntry: IndexEntryDir = { type: "dir", name: path.basename(dir), children: [] };
		const work: Promise<void>[] = [];

		for (const dirent of dirEntries) {
			const relPath = path.join(dir, dirent.name);
			const absPath = path.join(this.absRoot, relPath);

			if (dirent.isSymbolicLink()) {
				work.push(
					this.#resolveSymlink(absPath, dirent.name).then((entry) => {
						if (entry) {
							dirEntry.children.push(entry);
							this.paths.push(relPath);
							this.#entries.set(relPath, entry);
						}
					}),
				);
				continue;
			}

			if (dirent.isDirectory()) {
				work.push(
					this.#walkDir(relPath, signal).then((subtree) => {
						dirEntry.children.push(subtree);
						this.#entries.set(relPath, subtree);
					}),
				);
				continue;
			}

			work.push(
				Promise.all([fs.stat(absPath), this.#countLines(absPath)]).then(([s, lc]) => {
					const entry: IndexEntryFile = {
						type: "file",
						name: dirent.name,
						size: s.size,
						lineCount: lc.lineCount,
						maxLineLen: lc.maxLineLen,
						isBinary: lc.isBinary,
					};
					dirEntry.children.push(entry);
					this.paths.push(relPath);
					this.#entries.set(relPath, entry);
				}),
			);
		}

		await Promise.all(work);
		return dirEntry;
	}

	/** readlink for target path, stat (follows symlink) for size/type. Returns undefined on error. */
	async #resolveSymlink(absPath: string, name: string): Promise<IndexEntrySymlink | undefined> {
		try {
			const [target, stats] = await Promise.all([fs.readlink(absPath), fs.stat(absPath).catch(() => null)]);

			let targetType: IndexEntrySymlink["targetType"] = "unknown";
			let size = 0;

			if (stats) {
				if (stats.isFile()) {
					targetType = "file";
					size = stats.size;
				} else if (stats.isDirectory()) {
					targetType = "dir";
				}
			}

			return { type: "symlink", name, target, targetType, size };
		} catch {
			return undefined;
		}
	}

	/** Body-less line scan via {@link LineIter}. Binary files are detected by the null byte probe on the first chunk. */
	async #countLines(absPath: string): Promise<{ lineCount: number; maxLineLen: number; isBinary: boolean }> {
		await this.#fdPool.acquire();
		const stream = createReadStream(absPath);
		try {
			const iter = await LineIter.new(stream, { lineCap: 0 });
			let maxLineLen = 0;
			while (await iter.next()) {
				if (iter.len() > maxLineLen) maxLineLen = iter.len();
			}
			return { lineCount: iter.num(), maxLineLen, isBinary: false };
		} catch (err) {
			if (err instanceof ErrBinaryContent) {
				return { lineCount: 0, maxLineLen: 0, isBinary: true };
			}
			throw err;
		} finally {
			stream.destroy();
			this.#fdPool.release();
		}
	}
}

/** Bounds concurrent async operations. {@link acquire} blocks when the limit is reached. */
class Pool {
	readonly #limit: number;
	#active = 0;
	#queue: (() => void)[] = [];

	constructor(limit: number) {
		this.#limit = limit;
	}

	/** Take a slot. Returns a promise that resolves when a slot is available. */
	acquire(): Promise<void> | void {
		if (this.#active < this.#limit) {
			this.#active++;
			return;
		}
		return new Promise<void>((resolve) => this.#queue.push(resolve));
	}

	/** Return a slot. Wakes the next waiter if any. */
	release(): void {
		const next = this.#queue.shift();
		if (next) {
			next();
		} else {
			this.#active--;
		}
	}
}

function applyGlobFilters(paths: string[], opts?: FilterOptions): string[] {
	if (!opts?.includes?.length && !opts?.excludes?.length) return paths;

	const includeMatchers = opts.includes?.length ? compileGlobs(opts.includes) : [];
	const excludeMatchers = opts.excludes?.length ? compileGlobs(opts.excludes) : [];
	const filtered: string[] = [];

	for (const p of paths) {
		if (excludeMatchers.length > 0 && matchesAny(p, excludeMatchers)) continue;
		if (includeMatchers.length > 0 && !matchesAny(p, includeMatchers)) continue;
		filtered.push(p);
	}

	return filtered;
}

/** No slash in pattern → matchBase: true (matches basename at any depth). Slash → path-aware match. */
function compileGlobs(patterns: string[]): picomatch.Matcher[] {
	const matchers: picomatch.Matcher[] = [];

	for (const pattern of patterns) {
		try {
			matchers.push(picomatch(pattern, pattern.includes("/") ? undefined : { matchBase: true }));
		} catch {
			// skip invalid patterns
		}
	}

	return matchers;
}

/** Returns an error message for the first invalid glob, or undefined if all are valid. */
export function validateGlobs(patterns: string[]): string | undefined {
	for (const pattern of patterns) {
		try {
			picomatch(pattern);
		} catch (err) {
			return `invalid glob ${JSON.stringify(pattern)}: ${err instanceof Error ? err.message : String(err)}`;
		}
	}
	return undefined;
}

function matchesAny(p: string, matchers: picomatch.Matcher[]): boolean {
	for (const m of matchers) {
		if (m(p)) return true;
	}
	return false;
}

function capResults(paths: string[], limit?: number): string[] {
	if (limit != null && limit > 0 && paths.length > limit) {
		return paths.slice(0, limit);
	}
	return paths;
}
