import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { RepoFs, RepoFsError } from "./repofs.ts";

function git(args: string[], cwd: string): Promise<string> {
	return new Promise((res, rej) => {
		execFile("git", args, { cwd }, (err, stdout) => (err ? rej(err) : res(stdout)));
	});
}

let rootDir: string;
let rfs: RepoFs;

beforeAll(async () => {
	rootDir = await mkdtemp(join(tmpdir(), "repofs-test-"));

	await mkdir(join(rootDir, "src/nested"), { recursive: true });
	await mkdir(join(rootDir, "vendor"), { recursive: true });
	await mkdir(join(rootDir, ".hidden"), { recursive: true });
	await writeFile(join(rootDir, "README.md"), "# Test\nSecond line\n");
	await writeFile(join(rootDir, "src/main.ts"), 'console.log("hello");\nconsole.log("world");\n');
	await writeFile(join(rootDir, "src/nested/deep.ts"), "export const x = 1;\n");
	await writeFile(join(rootDir, "vendor/lib.js"), "module.exports = {};\n");
	await writeFile(join(rootDir, ".hidden/config"), "secret\n");
	await writeFile(join(rootDir, "empty.txt"), "");
	await writeFile(join(rootDir, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

	await symlink(tmpdir(), join(rootDir, "escape-link"));
	await symlink(join(rootDir, "src/main.ts"), join(rootDir, "link-to-file"));

	await git(["init"], rootDir);
	await git(["-c", "user.name=test", "-c", "user.email=test@test.com", "add", "."], rootDir);
	await git(["-c", "user.name=test", "-c", "user.email=test@test.com", "commit", "-m", "init"], rootDir);

	rfs = await RepoFs.open(rootDir);
});

afterAll(async () => {
	await rm(rootDir, { recursive: true, force: true, maxRetries: 3 });
});

describe("RepoFs.open", () => {
	it("opens a valid git repo", () => {
		expect(rfs.root).toBe(resolve(rootDir));
		expect(rfs.git).toBeDefined();
		expect(rfs.index).toBeDefined();
	});

	it("rejects non-existent path", async () => {
		await expect(RepoFs.open("/tmp/nonexistent-repofs-test-xyz")).rejects.toThrow(RepoFsError);
	});

	it("rejects file as root", async () => {
		const filePath = join(rootDir, "README.md");
		await expect(RepoFs.open(filePath)).rejects.toThrow("not a directory");
	});
});

describe("resolve", () => {
	it("returns relative path from root", () => {
		expect(rfs.resolve("src/main.ts")).toBe("src/main.ts");
	});

	it("resolves . to empty string", () => {
		expect(rfs.resolve(".")).toBe("");
	});

	it("normalizes redundant segments", () => {
		expect(rfs.resolve("src/../README.md")).toBe("README.md");
	});

	it("normalizes backslash separators", () => {
		expect(rfs.resolve("src\\main.ts")).toBe("src/main.ts");
	});

	it("normalizes mixed separators", () => {
		expect(rfs.resolve("src\\nested/deep.ts")).toBe("src/nested/deep.ts");
	});

	it("accepts absolute path inside root", () => {
		expect(rfs.resolve(join(resolve(rootDir), "src/main.ts"))).toBe("src/main.ts");
	});

	it("rejects .. escape", () => {
		expect(() => rfs.resolve("../etc/passwd")).toThrow("path escapes root");
	});

	it("rejects deep .. escape", () => {
		expect(() => rfs.resolve("src/../../etc/passwd")).toThrow("path escapes root");
	});

	it("rejects absolute path outside root", () => {
		expect(() => rfs.resolve("/etc/passwd")).toThrow("path escapes root");
	});

	it("resolves empty path to empty string", () => {
		expect(rfs.resolve("")).toBe("");
	});
});

describe("fileExists", () => {
	it("returns true for existing file", () => {
		expect(rfs.fileExists("README.md")).toBe(true);
	});

	it("returns false for directory", () => {
		expect(rfs.fileExists("src")).toBe(false);
	});

	it("returns false for non-existent", () => {
		expect(rfs.fileExists("nonexistent.ts")).toBe(false);
	});
});

describe("dirExists", () => {
	it("returns true for existing directory", () => {
		expect(rfs.dirExists("src")).toBe(true);
	});

	it("returns true for root", () => {
		expect(rfs.dirExists(".")).toBe(true);
	});

	it("returns false for file", () => {
		expect(rfs.dirExists("README.md")).toBe(false);
	});

	it("returns false for non-existent", () => {
		expect(rfs.dirExists("nonexistent")).toBe(false);
	});

	it("throws on escape attempt", () => {
		expect(() => rfs.dirExists("../../etc")).toThrow("path escapes root");
	});
});

describe("readFile", () => {
	it("returns file content as Buffer", async () => {
		const buf = await rfs.readFile("README.md");
		expect(buf).toBeInstanceOf(Buffer);
		expect(buf.toString("utf-8")).toBe("# Test\nSecond line\n");
	});

	it("reads binary content without rejection", async () => {
		const buf = await rfs.readFile("image.png");
		expect(buf).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	});

	it("rejects non-existent file", async () => {
		await expect(rfs.readFile("nonexistent.ts")).rejects.toThrow("file not found");
	});

	it("rejects directory", async () => {
		await expect(rfs.readFile("src")).rejects.toThrow("not a regular file");
	});

	it("rejects symlink", async () => {
		await expect(rfs.readFile("link-to-file")).rejects.toThrow("not a regular file");
	});

	it("provides suggestions for not found", async () => {
		try {
			await rfs.readFile("src/mian.ts");
		} catch (err) {
			expect(err).toBeInstanceOf(RepoFsError);
			expect((err as Error).message).toContain("file not found");
		}
	});

	it("lazily fills index entry size", async () => {
		const entry = rfs.index.get("src/main.ts");
		expect(entry?.type).toBe("file");
		expect((entry as { size: number | null }).size).toBeNull();
		const buf = await rfs.readFile("src/main.ts");
		expect((entry as { size: number | null }).size).toBe(buf.length);
	});

	it("records read paths for flush", async () => {
		rfs.flushReadPaths();
		await rfs.readFile("README.md");
		await rfs.readFile("src/main.ts");
		const paths = rfs.flushReadPaths();
		expect(paths).toEqual(["README.md", "src/main.ts"]);
		expect(rfs.flushReadPaths()).toEqual([]);
	});
});

describe("findFiles", () => {
	it("finds files by fuzzy pattern", () => {
		const results = rfs.findFiles("main");
		expect(results.length).toBeGreaterThan(0);
		expect(results.some((r) => r.includes("main.ts"))).toBe(true);
	});

	it("respects maxResults", () => {
		const results = rfs.findFiles("ts", { maxResults: 1 });
		expect(results).toHaveLength(1);
	});
});

describe("globFiles", () => {
	it("filters by glob pattern", () => {
		const results = rfs.globFiles({ includes: ["*.ts"] });
		expect(results.length).toBeGreaterThan(0);
		expect(results.every((r) => r.endsWith(".ts"))).toBe(true);
	});

	it("supports exclude patterns", () => {
		const all = rfs.globFiles({ includes: ["*.ts"] });
		const filtered = rfs.globFiles({ includes: ["*.ts"], excludes: ["**/nested/**"] });
		expect(filtered.length).toBeLessThan(all.length);
	});
});

describe("grep", () => {
	it("searches file contents", async () => {
		const result = await rfs.grep("hello");
		expect(result.lineCount).toBeGreaterThan(0);
		expect(result.output).toContain("main.ts");
	});

	it("returns empty for no matches", async () => {
		const result = await rfs.grep("zzz_no_match_zzz");
		expect(result.lineCount).toBe(0);
	});
});

describe("flushReadPaths", () => {
	it("returns empty when no reads happened", () => {
		rfs.flushReadPaths();
		expect(rfs.flushReadPaths()).toEqual([]);
	});
});

describe("gitignore filtering and read fallback", () => {
	let dir: string;
	let gfs: RepoFs;

	beforeAll(async () => {
		dir = await mkdtemp(join(tmpdir(), "repofs-gitview-"));
		await writeFile(join(dir, "tracked.txt"), "a");
		await writeFile(join(dir, "tracked-ignored.log"), "b");
		await git(["init"], dir);
		await git(["-c", "user.name=test", "-c", "user.email=test@test.com", "add", "."], dir);
		await git(["-c", "user.name=test", "-c", "user.email=test@test.com", "commit", "-m", "init"], dir);

		await writeFile(join(dir, ".gitignore"), "*.log\nignored-link\n");
		await writeFile(join(dir, "untracked.txt"), "c");
		await writeFile(join(dir, "untracked-ignored.log"), "d");
		await symlink("/etc/hosts", join(dir, "ignored-link"));

		gfs = await RepoFs.open(dir);
	});

	afterAll(async () => {
		await rm(dir, { recursive: true, force: true, maxRetries: 3 });
	});

	it("prunes tracked-but-ignored files from the index, still readable via fallback", async () => {
		expect(gfs.fileExists("tracked-ignored.log")).toBe(false);
		const buf = await gfs.readFile("tracked-ignored.log");
		expect(buf.toString("utf-8")).toBe("b");
	});

	it("excludes ignored untracked files", () => {
		expect(gfs.fileExists("untracked-ignored.log")).toBe(false);
	});

	it("includes untracked non-ignored files", () => {
		expect(gfs.fileExists("untracked.txt")).toBe(true);
		expect(gfs.fileExists(".gitignore")).toBe(true);
	});

	it("readFile fallback rejects unindexed symlinks", async () => {
		expect(gfs.index.get("ignored-link")).toBeUndefined();
		await expect(gfs.readFile("ignored-link")).rejects.toThrow("file not found");
	});

	it("readFile fallback still reads ignored regular files", async () => {
		const buf = await gfs.readFile("untracked-ignored.log");
		expect(buf.toString("utf-8")).toBe("d");
	});
});
