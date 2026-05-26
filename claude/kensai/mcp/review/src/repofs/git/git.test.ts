import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import {
	type GitFileStat,
	GitError,
	Repo,
	annotateDiff,
	countDiffLines,
	parseGitVersion,
	parseHunkStart,
} from "./git.ts";

function git(cwd: string, ...args: string[]): Promise<string> {
	return new Promise((res, rej) => {
		execFile("git", args, { cwd, encoding: "utf-8" }, (err, stdout) => {
			if (err) rej(err);
			else res(stdout);
		});
	});
}

async function initTestRepo(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "kensai-git-test-"));
	await git(dir, "init");
	await git(dir, "config", "user.email", "test@test.com");
	await git(dir, "config", "user.name", "Test");
	return dir;
}

describe("parseGitVersion", () => {
	it("standard version", () => {
		expect(parseGitVersion("git version 2.39.3")).toEqual({ major: 2, minor: 39 });
	});

	it("Apple Git suffix", () => {
		expect(parseGitVersion("git version 2.39.3 (Apple Git-146)")).toEqual({ major: 2, minor: 39 });
	});

	it("two-part version", () => {
		expect(parseGitVersion("git version 2.0")).toEqual({ major: 2, minor: 0 });
	});

	it("missing version keyword returns null", () => {
		expect(parseGitVersion("2.39.3")).toBeNull();
	});

	it("empty string returns null", () => {
		expect(parseGitVersion("")).toBeNull();
	});

	it("non-numeric version returns null", () => {
		expect(parseGitVersion("git version abc.def")).toBeNull();
	});

	it("single-part version returns null", () => {
		expect(parseGitVersion("git version 2")).toBeNull();
	});
});

describe("parseHunkStart", () => {
	it("standard hunk header", () => {
		expect(parseHunkStart("@@ -1,3 +1,4 @@")).toBe(1);
	});

	it("offset hunk", () => {
		expect(parseHunkStart("@@ -10,5 +20,7 @@")).toBe(20);
	});

	it("single-line count", () => {
		expect(parseHunkStart("@@ -1 +1 @@")).toBe(1);
	});

	it("large line number", () => {
		expect(parseHunkStart("@@ -100,20 +500,25 @@")).toBe(500);
	});

	it("no plus returns 1", () => {
		expect(parseHunkStart("@@ -1,3 @@")).toBe(1);
	});

	it("empty string returns 1", () => {
		expect(parseHunkStart("")).toBe(1);
	});

	it("plus at zero returns 1", () => {
		expect(parseHunkStart("@@ -1,3 +0,0 @@")).toBe(1);
	});
});

describe("annotateDiff", () => {
	it("single hunk with additions, deletions, context", () => {
		const raw = [
			"--- a/file.ts",
			"+++ b/file.ts",
			"@@ -1,3 +1,4 @@",
			" line1",
			"-removed",
			"+added1",
			"+added2",
			" line3",
		].join("\n");

		const result = annotateDiff(raw);
		const lines = result.split("\n");

		expect(lines[0]).toBe("--- a/file.ts");
		expect(lines[1]).toBe("+++ b/file.ts");
		expect(lines[2]).toBe("@@ -1,3 +1,4 @@");
		expect(lines[3]).toBe("   1   line1");
		expect(lines[4]).toBe("   -   removed");
		expect(lines[5]).toBe("   2 + added1");
		expect(lines[6]).toBe("   3 + added2");
		expect(lines[7]).toBe("   4   line3");
	});

	it("multi-hunk preserves line numbering", () => {
		const raw = [
			"--- a/file.ts",
			"+++ b/file.ts",
			"@@ -1,2 +1,2 @@",
			"-old",
			"+new",
			" ctx",
			"@@ -10,2 +10,3 @@",
			" before",
			"+inserted",
			" after",
		].join("\n");

		const result = annotateDiff(raw);
		expect(result).toContain("   1 + new");
		expect(result).toContain("   2   ctx");
		expect(result).toContain("  10   before");
		expect(result).toContain("  11 + inserted");
		expect(result).toContain("  12   after");
	});

	it("deletion lines have no line number", () => {
		const raw = ["--- a/f.ts", "+++ b/f.ts", "@@ -1,2 +1,1 @@", "-gone", " kept"].join("\n");

		const result = annotateDiff(raw);
		expect(result).toContain("   -   gone");
		expect(result).toContain("   1   kept");
	});
});

describe("countDiffLines", () => {
	it("counts additions and deletions", () => {
		const diff = [
			"--- a/file.ts",
			"+++ b/file.ts",
			"@@ -1,3 +1,4 @@",
			" context",
			"-deleted1",
			"-deleted2",
			"+added1",
			"+added2",
			"+added3",
			" context",
		].join("\n");

		expect(countDiffLines(diff)).toEqual({ additions: 3, deletions: 2 });
	});

	it("empty diff", () => {
		expect(countDiffLines("")).toEqual({ additions: 0, deletions: 0 });
	});

	it("skips file headers", () => {
		const diff = "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new\n";
		expect(countDiffLines(diff)).toEqual({ additions: 1, deletions: 1 });
	});
});

describe("Repo", () => {
	let repoDir: string;
	let repo: Repo;

	beforeAll(async () => {
		repoDir = await initTestRepo();

		await writeFile(join(repoDir, "hello.txt"), "hello\nworld\n");
		await writeFile(join(repoDir, "readme.md"), "# test\n");
		await git(repoDir, "add", ".");
		await git(repoDir, "commit", "-m", "initial commit");

		await writeFile(join(repoDir, "hello.txt"), "hello\nworld\nfoo\n");
		await writeFile(join(repoDir, "new.txt"), "new file\n");
		await git(repoDir, "rm", "readme.md");
		await git(repoDir, "add", ".");
		await git(repoDir, "commit", "-m", "second commit");

		repo = await Repo.open(repoDir);
	});

	afterAll(async () => {
		await rm(repoDir, { recursive: true, force: true, maxRetries: 3 });
	});

	it("open rejects non-repo directory", async () => {
		const nonRepo = await mkdtemp(join(tmpdir(), "kensai-git-test-"));
		try {
			await expect(Repo.open(nonRepo)).rejects.toThrow(GitError);
		} finally {
			await rm(nonRepo, { recursive: true, force: true, maxRetries: 3 });
		}
	});

	it("open rejects non-existent path", async () => {
		await expect(Repo.open("/tmp/does-not-exist-kensai-test")).rejects.toThrow(GitError);
	});

	it("path returns absolute path", () => {
		expect(repo.path).toBe(repoDir);
	});

	it("log returns commit entries with metadata", async () => {
		const entries = await repo.log("HEAD", 10);
		expect(entries).toHaveLength(2);
		expect(entries[0]!.sha).toHaveLength(40);
		expect(entries[0]!.subject).toBe("second commit");
		expect(entries[0]!.body).toBe("");
		expect(entries[0]!.author).toBe("Test");
		expect(entries[0]!.authorEmail).toBe("test@test.com");
		expect(entries[0]!.date).toBeInstanceOf(Date);
		expect(entries[0]!.date.getTime()).not.toBeNaN();
		expect(entries[1]!.subject).toBe("initial commit");
	});

	it("log clamps to available commits", async () => {
		const entries = await repo.log("HEAD", 100);
		expect(entries).toHaveLength(2);
	});

	it("log with count 1 returns latest", async () => {
		const entries = await repo.log("HEAD", 1);
		expect(entries).toHaveLength(1);
		expect(entries[0]!.subject).toBe("second commit");
	});

	it("changedFiles returns file stats", async () => {
		const files = await repo.changedFiles("HEAD~1", "HEAD");
		expect(files).toHaveLength(3);

		const byPath = new Map(files.map((f) => [f.path, f]));

		const hello = byPath.get("hello.txt")!;
		expect(hello.status).toBe("modified");
		expect(hello.additions).toBe(1);
		expect(hello.deletions).toBe(0);

		const newFile = byPath.get("new.txt")!;
		expect(newFile.status).toBe("added");
		expect(newFile.additions).toBe(1);

		const readme = byPath.get("readme.md")!;
		expect(readme.status).toBe("deleted");
		expect(readme.deletions).toBe(1);
	});

	it("changedFiles returns empty for same revision", async () => {
		const files = await repo.changedFiles("HEAD", "HEAD");
		expect(files).toHaveLength(0);
	});

	it("diffFile returns unified diff", async () => {
		const diff = await repo.diffFile("HEAD~1", "HEAD", "hello.txt");
		expect(diff).toContain("+foo");
	});

	it("diffFile returns empty for no changes", async () => {
		const diff = await repo.diffFile("HEAD", "HEAD", "hello.txt");
		expect(diff).toBe("");
	});

	it("diffFile with custom context lines", async () => {
		const diff = await repo.diffFile("HEAD~1", "HEAD", "hello.txt", 1);
		expect(diff).toContain("+foo");
		const contextLines = diff.split("\n").filter((l) => l.startsWith(" "));
		expect(contextLines.length).toBeLessThanOrEqual(2);
	});

	it("diffFile rejects bad revision", async () => {
		await expect(repo.diffFile("nonexistent", "HEAD", "hello.txt")).rejects.toThrow(GitError);
	});

	it("changedFiles rejects bad revision", async () => {
		await expect(repo.changedFiles("nonexistent", "HEAD")).rejects.toThrow(GitError);
	});
});

describe("Repo with binary files", () => {
	let repoDir: string;
	let repo: Repo;

	beforeAll(async () => {
		repoDir = await initTestRepo();

		await writeFile(join(repoDir, "text.txt"), "line1\nline2\n");
		await writeFile(join(repoDir, "binary.bin"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));
		await git(repoDir, "add", ".");
		await git(repoDir, "commit", "-m", "add files");

		await writeFile(join(repoDir, "binary.bin"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x03, 0x04]));
		await git(repoDir, "add", ".");
		await git(repoDir, "commit", "-m", "modify binary");

		repo = await Repo.open(repoDir);
	});

	afterAll(async () => {
		await rm(repoDir, { recursive: true, force: true, maxRetries: 3 });
	});

	it("changedFiles reports binary with dash counts", async () => {
		const files = await repo.changedFiles("HEAD~1", "HEAD");
		const bin = files.find((f) => f.path === "binary.bin") as GitFileStat;
		expect(bin).toBeDefined();
		expect(bin.status).toBe("modified");
		expect(bin.additions).toBe(0);
		expect(bin.deletions).toBe(0);
	});
});

describe("Repo log with multi-line messages", () => {
	let repoDir: string;
	let repo: Repo;

	beforeAll(async () => {
		repoDir = await initTestRepo();

		await writeFile(join(repoDir, "a.txt"), "a\n");
		await git(repoDir, "add", ".");
		await git(repoDir, "commit", "-m", "subject only");

		await writeFile(join(repoDir, "b.txt"), "b\n");
		await git(repoDir, "add", ".");
		await git(
			repoDir,
			"commit",
			"-m",
			"feat: add feature\n\nThis is the body.\nIt spans multiple lines.\n\nSigned-off-by: Test <test@test.com>",
		);

		repo = await Repo.open(repoDir);
	});

	afterAll(async () => {
		await rm(repoDir, { recursive: true, force: true, maxRetries: 3 });
	});

	it("parses subject and body separately", async () => {
		const entries = await repo.log("HEAD", 2);
		expect(entries).toHaveLength(2);

		const latest = entries[0]!;
		expect(latest.subject).toBe("feat: add feature");
		expect(latest.body).toContain("This is the body.");
		expect(latest.body).toContain("It spans multiple lines.");
		expect(latest.body).toContain("Signed-off-by:");
	});

	it("subject-only commit has empty body", async () => {
		const entries = await repo.log("HEAD", 2);
		expect(entries[1]!.subject).toBe("subject only");
		expect(entries[1]!.body).toBe("");
	});
});
