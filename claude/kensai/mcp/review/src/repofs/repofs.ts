import fsp from "node:fs/promises";
import path from "node:path";

import { Repo } from "./git/git.ts";
import type { FilterOptions } from "./pathindex/pathindex.ts";
import { PathIndex, WALK_EXCLUDE_DIRS } from "./pathindex/pathindex.ts";
import type { GrepOptions, GrepResult } from "./rg/rg.ts";
import { grep } from "./rg/rg.ts";

export class RepoFsError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "RepoFsError";
	}
}

/**
 * Scoped filesystem facade for a git repository. Composes {@link PathIndex} for file discovery,
 * {@link Repo} for git operations, and ripgrep for content search behind a containment layer
 * that prevents path escape via `..`.
 */
export class RepoFs {
	readonly #root: string;
	readonly #index: PathIndex;
	readonly #git: Repo;
	readonly #pendingReadPaths: string[] = [];

	private constructor(root: string, index: PathIndex, git: Repo) {
		this.#root = root;
		this.#index = index;
		this.#git = git;
	}

	/** Builds the file index (gitignore-aware walk) and validates git in parallel. */
	static async open(root: string, signal?: AbortSignal): Promise<RepoFs> {
		const absRoot = path.resolve(root);

		const info = await fsp.stat(absRoot).catch((err) => {
			throw new RepoFsError(`${absRoot}: cannot access root`, { cause: err as Error });
		});

		if (!info.isDirectory()) {
			throw new RepoFsError(`${absRoot}: not a directory`);
		}

		const [index, git] = await Promise.all([PathIndex.new(absRoot, signal), Repo.open(absRoot, signal)]);
		return new RepoFs(absRoot, index, git);
	}

	get root(): string {
		return this.#root;
	}

	get git(): Repo {
		return this.#git;
	}

	/** O(1) lookup, fuzzy search, and glob filtering. Built once at {@link open}. */
	get index(): PathIndex {
		return this.#index;
	}

	/** Normalizes any path (absolute or relative) to POSIX relative from root. Throws on escape. */
	resolve(p: string): string {
		const abs = path.resolve(this.#root, path.posix.normalize(p.replaceAll("\\", "/")));
		const rel = path.relative(this.#root, abs).replaceAll("\\", "/");

		if (rel.startsWith("..")) {
			throw new RepoFsError(`path escapes root: ${p}`);
		}

		return rel;
	}

	fileExists(p: string): boolean {
		return this.#index.get(this.resolve(p))?.type === "file";
	}

	dirExists(p: string): boolean {
		return this.#index.dir(this.resolve(p)) !== undefined;
	}

	/** Resolves path, validates via index or filesystem, returns raw bytes. Falls through to direct read for files not in the index. */
	async readFile(p: string): Promise<Buffer> {
		const rel = this.resolve(p);
		const entry = this.#index.get(rel);

		if (entry && entry.type !== "file") {
			throw new RepoFsError(`${rel}: not a regular file (${entry.type})`);
		}

		const absPath = path.resolve(this.#root, rel);

		if (!entry) {
			const firstSegment = rel.split("/")[0];
			if (firstSegment && WALK_EXCLUDE_DIRS.has(firstSegment)) {
				throw new RepoFsError(`file not found: ${rel}`);
			}
			// lstat, not stat — a symlink outside the index must not be readable through
			// the fallback, or it would bypass path containment.
			const stat = await fsp.lstat(absPath).catch(() => null);
			if (!stat?.isFile()) {
				throw new RepoFsError(`file not found: ${rel}`);
			}
		}

		this.#pendingReadPaths.push(rel);
		const buf = await fsp.readFile(absPath);
		if (entry) entry.size = buf.length;
		return buf;
	}

	/** Fuzzy search via {@link PathIndex.fuzzySearch}. */
	findFiles(pattern: string, options?: FilterOptions): string[] {
		return this.#index.fuzzySearch(pattern, options);
	}

	/** Glob filter via {@link PathIndex.globSearch}. */
	globFiles(options?: FilterOptions): string[] {
		return this.#index.globSearch(options);
	}

	/** Content search via ripgrep, scoped to root. */
	async grep(pattern: string, options?: GrepOptions, signal?: AbortSignal): Promise<GrepResult> {
		return grep(this.#root, pattern, options, signal);
	}

	/** Returns and clears paths from successful {@link readFile} calls. Hook for instruction resolution. */
	flushReadPaths(): string[] {
		const paths = [...this.#pendingReadPaths];
		this.#pendingReadPaths.length = 0;
		return paths;
	}
}

export type { FilterOptions } from "./pathindex/pathindex.ts";
export type { GrepOptions, GrepResult } from "./rg/rg.ts";
