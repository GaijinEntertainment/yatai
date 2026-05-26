import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { RgError, grep, parseRgVersion, processOutput, DEFAULT_EXCLUDE_DIRS } from "./rg.ts";

describe("parseRgVersion", () => {
	it("standard version", () => {
		expect(parseRgVersion("ripgrep 14.1.0")).toEqual({ major: 14, minor: 1, patch: 0 });
	});

	it("version with build info", () => {
		expect(parseRgVersion("ripgrep 14.1.0\n-SIMD -AVX (compiled)")).toEqual({
			major: 14,
			minor: 1,
			patch: 0,
		});
	});

	it("version with revision suffix", () => {
		expect(parseRgVersion("ripgrep 14.1.0 (rev abc1234)")).toEqual({ major: 14, minor: 1, patch: 0 });
	});

	it("older version", () => {
		expect(parseRgVersion("ripgrep 13.0.0")).toEqual({ major: 13, minor: 0, patch: 0 });
	});

	it("missing ripgrep keyword returns null", () => {
		expect(parseRgVersion("14.1.0")).toBeNull();
	});

	it("empty string returns null", () => {
		expect(parseRgVersion("")).toBeNull();
	});

	it("non-numeric version returns null", () => {
		expect(parseRgVersion("ripgrep abc.def.ghi")).toBeNull();
	});

	it("two-part version returns null", () => {
		expect(parseRgVersion("ripgrep 14.1")).toBeNull();
	});
});

describe("processOutput", () => {
	it("empty string returns empty result", () => {
		expect(processOutput("", 100)).toEqual({ output: "", lineCount: 0, truncated: false });
	});

	it("single match line", () => {
		const result = processOutput("file.ts:42:hello world\n", 100);
		expect(result.output).toBe("file.ts:42:hello world");
		expect(result.lineCount).toBe(1);
		expect(result.truncated).toBe(false);
	});

	it("strips ./ prefix from paths", () => {
		const result = processOutput("./src/file.ts:1:content\n./src/other.ts:2:more\n", 100);
		expect(result.output).toBe("src/file.ts:1:content\nsrc/other.ts:2:more");
		expect(result.lineCount).toBe(2);
	});

	it("preserves paths without ./ prefix", () => {
		const result = processOutput("src/file.ts:1:content\n", 100);
		expect(result.output).toBe("src/file.ts:1:content");
	});

	it("context separators not counted as lines", () => {
		const input = "a.ts:1:match1\na.ts:2:ctx\n--\nb.ts:5:match2\n";
		const result = processOutput(input, 100);
		expect(result.lineCount).toBe(3);
		expect(result.output).toContain("--");
	});

	it("truncates at maxResults", () => {
		const lines = Array.from({ length: 10 }, (_, i) => `file.ts:${i + 1}:line${i + 1}`);
		const input = `${lines.join("\n")}\n`;
		const result = processOutput(input, 5);
		expect(result.lineCount).toBe(5);
		expect(result.truncated).toBe(true);
		expect(result.output.split("\n")).toHaveLength(5);
	});

	it("removes trailing separator on truncation", () => {
		const input = "a.ts:1:x\na.ts:2:y\n--\nb.ts:1:z\n";
		const result = processOutput(input, 2);
		expect(result.truncated).toBe(true);
		expect(result.output).not.toMatch(/--$/);
		expect(result.lineCount).toBe(2);
	});

	it("handles output without trailing newline", () => {
		const result = processOutput("file.ts:1:content", 100);
		expect(result.output).toBe("file.ts:1:content");
		expect(result.lineCount).toBe(1);
	});

	it("maxResults of 0 truncates immediately", () => {
		const result = processOutput("file.ts:1:content\n", 0);
		expect(result.output).toBe("");
		expect(result.lineCount).toBe(0);
		expect(result.truncated).toBe(true);
	});

	it("multiple separators between groups", () => {
		const input = "a.ts:1:x\n--\nb.ts:1:y\n--\nc.ts:1:z\n";
		const result = processOutput(input, 100);
		expect(result.lineCount).toBe(3);
		expect(result.truncated).toBe(false);
	});
});

describe("grep", () => {
	let testDir: string;

	beforeAll(async () => {
		testDir = await mkdtemp(join(tmpdir(), "kensai-rg-test-"));

		await writeFile(join(testDir, "hello.txt"), "hello world\nfoo bar\nhello again\n");
		await writeFile(join(testDir, "data.ts"), "const x = 42;\nconst hello = 'world';\nexport { hello };\n");
		await mkdir(join(testDir, "sub"), { recursive: true });
		await writeFile(join(testDir, "sub", "nested.txt"), "nested hello\nno match here\n");
		await writeFile(join(testDir, "case.txt"), "Hello World\nHELLO CAPS\nhello lower\n");

		const manyLines = Array.from({ length: 50 }, (_, i) => `match_line_${i}`);
		await writeFile(join(testDir, "many.txt"), `${manyLines.join("\n")}\n`);
	});

	afterAll(async () => {
		await rm(testDir, { recursive: true, force: true, maxRetries: 3 });
	});

	it("finds matches across files", async () => {
		const result = await grep(testDir, "hello", { contextLines: 0 });
		expect(result.lineCount).toBeGreaterThan(0);
		expect(result.output).toContain("hello");
		expect(result.truncated).toBe(false);
	});

	it("returns empty result for no matches", async () => {
		const result = await grep(testDir, "zzz_no_match_zzz");
		expect(result.output).toBe("");
		expect(result.lineCount).toBe(0);
		expect(result.truncated).toBe(false);
	});

	it("respects glob filter", async () => {
		const result = await grep(testDir, "hello", { glob: "*.ts", contextLines: 0 });
		expect(result.output).toContain("data.ts");
		expect(result.output).not.toContain("hello.txt");
		expect(result.output).not.toContain("nested.txt");
	});

	it("case-insensitive search", async () => {
		const sensitive = await grep(testDir, "HELLO", { target: ["case.txt"], contextLines: 0 });
		const insensitive = await grep(testDir, "HELLO", {
			target: ["case.txt"],
			caseInsensitive: true,
			contextLines: 0,
		});
		expect(insensitive.lineCount).toBeGreaterThan(sensitive.lineCount);
	});

	it("respects maxResults", async () => {
		const result = await grep(testDir, "match_line", { target: ["many.txt"], maxResults: 5, contextLines: 0 });
		expect(result.lineCount).toBe(5);
		expect(result.truncated).toBe(true);
	});

	it("supports target as single path", async () => {
		const result = await grep(testDir, "hello", { target: ["sub"], contextLines: 0 });
		expect(result.output).toContain("nested");
		expect(result.output).not.toContain("hello.txt");
	});

	it("supports target as array of paths", async () => {
		const result = await grep(testDir, "hello", { target: ["hello.txt", "sub/"], contextLines: 0 });
		expect(result.output).toContain("hello.txt");
		expect(result.output).toContain("nested");
		expect(result.output).not.toContain("data.ts");
	});

	it("rejects invalid regex pattern", async () => {
		await expect(grep(testDir, "[invalid")).rejects.toThrow(RgError);
	});

	it("includes context lines by default", async () => {
		const result = await grep(testDir, "foo bar", { target: ["hello.txt"] });
		expect(result.output).toContain("hello world");
		expect(result.output).toContain("foo bar");
		expect(result.output).toContain("hello again");
	});

	it("contextLines=0 shows matches only", async () => {
		const result = await grep(testDir, "foo bar", { target: ["hello.txt"], contextLines: 0 });
		expect(result.output).toContain("foo bar");
		const outputLines = result.output.split("\n").filter((l) => l !== "--");
		expect(outputLines).toHaveLength(1);
	});

	it("output paths are relative to root", async () => {
		const result = await grep(testDir, "nested", { contextLines: 0 });
		expect(result.output).toMatch(/^sub\/nested\.txt:\d+:/m);
	});

	it("excludes node_modules by default", async () => {
		await mkdir(join(testDir, "node_modules", "pkg"), { recursive: true });
		await writeFile(join(testDir, "node_modules", "pkg", "index.js"), "hello from npm\n");
		const result = await grep(testDir, "hello from npm", { contextLines: 0 });
		expect(result.lineCount).toBe(0);
	});

	it("custom excludeDirs overrides defaults", async () => {
		const result = await grep(testDir, "hello from npm", { excludeDirs: [], contextLines: 0 });
		expect(result.lineCount).toBeGreaterThan(0);
		expect(result.output).toContain("node_modules");
	});

	it("DEFAULT_EXCLUDE_DIRS is exported and non-empty", () => {
		expect(DEFAULT_EXCLUDE_DIRS).toContain(".git");
		expect(DEFAULT_EXCLUDE_DIRS).toContain("node_modules");
		expect(DEFAULT_EXCLUDE_DIRS.length).toBeGreaterThanOrEqual(5);
	});
});
