import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import type { GitFileStat } from "../repofs/git/git.ts";
import { Session, filterReviewableFiles, shouldSkipDiff } from "./session.ts";

function git(cwd: string, ...args: string[]): Promise<string> {
	return new Promise((res, rej) => {
		execFile("git", args, { cwd, encoding: "utf-8" }, (err, stdout) => {
			if (err) rej(err);
			else res(stdout);
		});
	});
}

async function initTestRepo(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "kensai-session-test-"));
	await git(dir, "init");
	await git(dir, "config", "user.email", "test@test.com");
	await git(dir, "config", "user.name", "Test");
	return dir;
}

// --- shouldSkipDiff ---

describe("shouldSkipDiff", () => {
	it("skips collapsed prefixes", () => {
		expect(shouldSkipDiff("vendor/lib/foo.go")).toBe(true);
		expect(shouldSkipDiff("node_modules/pkg/index.js")).toBe(true);
		expect(shouldSkipDiff("dist/bundle.js")).toBe(true);
		expect(shouldSkipDiff("build/output.js")).toBe(true);
		expect(shouldSkipDiff("__pycache__/mod.pyc")).toBe(true);
		expect(shouldSkipDiff(".git/config")).toBe(true);
	});

	it("skips exact lock files at root", () => {
		expect(shouldSkipDiff("go.sum")).toBe(true);
		expect(shouldSkipDiff("yarn.lock")).toBe(true);
		expect(shouldSkipDiff("package-lock.json")).toBe(true);
		expect(shouldSkipDiff("pnpm-lock.yaml")).toBe(true);
		expect(shouldSkipDiff("Cargo.lock")).toBe(true);
		expect(shouldSkipDiff("Gemfile.lock")).toBe(true);
		expect(shouldSkipDiff("composer.lock")).toBe(true);
		expect(shouldSkipDiff("poetry.lock")).toBe(true);
		expect(shouldSkipDiff("Pipfile.lock")).toBe(true);
	});

	it("skips nested lock files", () => {
		expect(shouldSkipDiff("sub/package-lock.json")).toBe(true);
		expect(shouldSkipDiff("deep/nested/yarn.lock")).toBe(true);
	});

	it("skips generated suffixes", () => {
		expect(shouldSkipDiff("api.pb.go")).toBe(true);
		expect(shouldSkipDiff("types.gen.go")).toBe(true);
		expect(shouldSkipDiff("schema_generated.go")).toBe(true);
		expect(shouldSkipDiff("bundle.min.js")).toBe(true);
		expect(shouldSkipDiff("styles.min.css")).toBe(true);
		expect(shouldSkipDiff("bundle.js.map")).toBe(true);
	});

	it("allows normal files", () => {
		expect(shouldSkipDiff("src/main.ts")).toBe(false);
		expect(shouldSkipDiff("README.md")).toBe(false);
		expect(shouldSkipDiff("package.json")).toBe(false);
		expect(shouldSkipDiff("go.mod")).toBe(false);
	});
});

// --- filterReviewableFiles ---

describe("filterReviewableFiles", () => {
	it("excludes deleted files", () => {
		const files: GitFileStat[] = [
			{ path: "a.ts", status: "added", additions: 10, deletions: 0 },
			{ path: "b.ts", status: "deleted", additions: 0, deletions: 5 },
			{ path: "c.ts", status: "modified", additions: 3, deletions: 1 },
		];
		const result = filterReviewableFiles(files);
		expect(result.map((f) => f.path)).toEqual(["a.ts", "c.ts"]);
	});

	it("excludes vendor and lock files", () => {
		const files: GitFileStat[] = [
			{ path: "src/main.ts", status: "modified", additions: 1, deletions: 0 },
			{ path: "vendor/lib/dep.go", status: "modified", additions: 10, deletions: 5 },
			{ path: "node_modules/pkg/index.js", status: "added", additions: 100, deletions: 0 },
			{ path: "package-lock.json", status: "modified", additions: 500, deletions: 200 },
		];
		const result = filterReviewableFiles(files);
		expect(result).toHaveLength(1);
		expect(result[0]!.path).toBe("src/main.ts");
	});

	it("returns empty for all-deleted input", () => {
		const files: GitFileStat[] = [{ path: "gone.ts", status: "deleted", additions: 0, deletions: 10 }];
		expect(filterReviewableFiles(files)).toHaveLength(0);
	});
});

// --- Session ---

describe("Session", () => {
	describe("committed mode", () => {
		let repoDir: string;

		beforeAll(async () => {
			repoDir = await initTestRepo();

			await writeFile(join(repoDir, "hello.txt"), "hello\nworld\n");
			await writeFile(join(repoDir, "readme.md"), "# test\n");
			await git(repoDir, "add", ".");
			await git(repoDir, "commit", "-m", "initial commit");

			await writeFile(join(repoDir, "hello.txt"), "hello\nworld\nfoo\n");
			await writeFile(join(repoDir, "new.txt"), "new file\n");
			await git(repoDir, "add", ".");
			await git(repoDir, "commit", "-m", "second commit");
		});

		afterAll(async () => {
			await rm(repoDir, { recursive: true, force: true });
		});

		it("generates a 40-char hex session ID", async () => {
			const session = await Session.start(repoDir, "committed");
			expect(session.id).toHaveLength(40);
			expect(session.id).toMatch(/^[0-9a-f]{40}$/);
		});

		it("stores root and mode", async () => {
			const session = await Session.start(repoDir, "committed");
			expect(session.root).toBe(repoDir);
			expect(session.mode).toBe("committed");
			expect(session.startedAt).toBeInstanceOf(Date);
		});

		it("collects HEAD commit info", async () => {
			const session = await Session.start(repoDir, "committed");
			expect(session.commit).not.toBeNull();
			expect(session.commit!.subject).toBe("second commit");
			expect(session.commit!.sha).toHaveLength(40);
			expect(session.commit!.author).toBe("Test");
		});

		it("collects changed files with stats", async () => {
			const session = await Session.start(repoDir, "committed");
			expect(session.changedFiles).toHaveLength(2);

			const byPath = new Map(session.changedFiles.map((f) => [f.path, f]));
			expect(byPath.get("hello.txt")!.status).toBe("modified");
			expect(byPath.get("new.txt")!.status).toBe("added");
		});

		it("collects per-file diffs with content", async () => {
			const session = await Session.start(repoDir, "committed");
			expect(session.diffs).toHaveLength(2);

			const helloDiff = session.diffs.find((d) => d.path === "hello.txt");
			expect(helloDiff).toBeDefined();
			expect(helloDiff!.content).toContain("+foo");
		});

		it("builds manifest for non-deleted files", async () => {
			const session = await Session.start(repoDir, "committed");
			expect(session.manifest).toHaveLength(2);

			const hello = session.manifest.find((m) => m.path === "hello.txt");
			expect(hello).toBeDefined();
			expect(hello!.bytes).toBeGreaterThan(0);
			expect(hello!.lines).toBe(3);
			expect(hello!.binary).toBe(false);
		});

		it("creates fresh storages", async () => {
			const session = await Session.start(repoDir, "committed");
			expect(session.findings.list()).toHaveLength(0);
			expect(session.grounding.hasContent()).toBe(false);
		});
	});

	describe("uncommitted mode", () => {
		let repoDir: string;

		beforeAll(async () => {
			repoDir = await initTestRepo();

			await writeFile(join(repoDir, "file.txt"), "original\n");
			await git(repoDir, "add", ".");
			await git(repoDir, "commit", "-m", "initial");

			await writeFile(join(repoDir, "file.txt"), "original\nmodified\n");
		});

		afterAll(async () => {
			await rm(repoDir, { recursive: true, force: true });
		});

		it("commit is null", async () => {
			const session = await Session.start(repoDir, "uncommitted");
			expect(session.commit).toBeNull();
		});

		it("sees working tree changes", async () => {
			const session = await Session.start(repoDir, "uncommitted");
			const paths = session.changedFiles.map((f) => f.path);
			expect(paths).toContain("file.txt");
		});

		it("collects diffs for uncommitted files", async () => {
			const session = await Session.start(repoDir, "uncommitted");
			const fileDiff = session.diffs.find((d) => d.path === "file.txt");
			expect(fileDiff).toBeDefined();
			expect(fileDiff!.content).toContain("+modified");
		});
	});

	describe("all mode", () => {
		let repoDir: string;

		beforeAll(async () => {
			repoDir = await initTestRepo();

			await writeFile(join(repoDir, "base.txt"), "base\n");
			await git(repoDir, "add", ".");
			await git(repoDir, "commit", "-m", "base commit");

			await writeFile(join(repoDir, "committed.txt"), "committed\n");
			await git(repoDir, "add", ".");
			await git(repoDir, "commit", "-m", "head commit");

			await writeFile(join(repoDir, "uncommitted.txt"), "uncommitted\n");
			await git(repoDir, "add", "uncommitted.txt");
		});

		afterAll(async () => {
			await rm(repoDir, { recursive: true, force: true });
		});

		it("has HEAD commit info", async () => {
			const session = await Session.start(repoDir, "all");
			expect(session.commit).not.toBeNull();
			expect(session.commit!.subject).toBe("head commit");
		});

		it("sees both committed and uncommitted changes", async () => {
			const session = await Session.start(repoDir, "all");
			const paths = session.changedFiles.map((f) => f.path);
			expect(paths).toContain("committed.txt");
			expect(paths).toContain("uncommitted.txt");
		});

		it("collects diffs for all changed files", async () => {
			const session = await Session.start(repoDir, "all");
			const diffPaths = session.diffs.map((d) => d.path);
			expect(diffPaths).toContain("committed.txt");
			expect(diffPaths).toContain("uncommitted.txt");
		});
	});

	describe("diff filtering", () => {
		let repoDir: string;

		beforeAll(async () => {
			repoDir = await initTestRepo();

			await writeFile(join(repoDir, "src.ts"), "code\n");
			await mkdir(join(repoDir, "vendor"), { recursive: true });
			await writeFile(join(repoDir, "vendor/dep.go"), "vendored\n");
			await writeFile(join(repoDir, "package-lock.json"), "{}\n");
			await git(repoDir, "add", ".");
			await git(repoDir, "commit", "-m", "initial");

			await writeFile(join(repoDir, "src.ts"), "code\nchanged\n");
			await writeFile(join(repoDir, "vendor/dep.go"), "vendored\nchanged\n");
			await writeFile(join(repoDir, "package-lock.json"), '{"updated": true}\n');
			await git(repoDir, "add", ".");
			await git(repoDir, "commit", "-m", "modify all");
		});

		afterAll(async () => {
			await rm(repoDir, { recursive: true, force: true });
		});

		it("excludes vendor and lock diffs but keeps them in changedFiles and manifest", async () => {
			const session = await Session.start(repoDir, "committed");

			expect(session.changedFiles).toHaveLength(3);

			expect(session.manifest).toHaveLength(3);
			expect(session.manifest.map((m) => m.path)).toContain("vendor/dep.go");
			expect(session.manifest.map((m) => m.path)).toContain("package-lock.json");

			expect(session.diffs).toHaveLength(1);
			expect(session.diffs[0]!.path).toBe("src.ts");
		});
	});

	describe("deleted files", () => {
		let repoDir: string;

		beforeAll(async () => {
			repoDir = await initTestRepo();

			await writeFile(join(repoDir, "keep.txt"), "keep\n");
			await writeFile(join(repoDir, "remove.txt"), "remove\n");
			await git(repoDir, "add", ".");
			await git(repoDir, "commit", "-m", "initial");

			await git(repoDir, "rm", "remove.txt");
			await writeFile(join(repoDir, "keep.txt"), "keep\nmodified\n");
			await git(repoDir, "add", ".");
			await git(repoDir, "commit", "-m", "delete file");
		});

		afterAll(async () => {
			await rm(repoDir, { recursive: true, force: true });
		});

		it("excludes deleted files from diffs and manifest but keeps in changedFiles", async () => {
			const session = await Session.start(repoDir, "committed");

			expect(session.changedFiles).toHaveLength(2);
			expect(session.changedFiles.find((f) => f.path === "remove.txt")!.status).toBe("deleted");

			expect(session.diffs).toHaveLength(1);
			expect(session.diffs[0]!.path).toBe("keep.txt");

			expect(session.manifest).toHaveLength(1);
			expect(session.manifest[0]!.path).toBe("keep.txt");
		});
	});

	describe("unique IDs", () => {
		let repoDir: string;

		beforeAll(async () => {
			repoDir = await initTestRepo();
			await writeFile(join(repoDir, "a.txt"), "a\n");
			await git(repoDir, "add", ".");
			await git(repoDir, "commit", "-m", "init");
			await writeFile(join(repoDir, "a.txt"), "b\n");
			await git(repoDir, "add", ".");
			await git(repoDir, "commit", "-m", "change");
		});

		afterAll(async () => {
			await rm(repoDir, { recursive: true, force: true });
		});

		it("generates different IDs across sessions", async () => {
			const s1 = await Session.start(repoDir, "committed");
			await new Promise((r) => setTimeout(r, 5));
			const s2 = await Session.start(repoDir, "committed");
			expect(s1.id).not.toBe(s2.id);
		});
	});
});
