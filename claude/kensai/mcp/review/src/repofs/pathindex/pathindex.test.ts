import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { PathIndex, validateGlobs } from "./pathindex.ts";
import type { IndexEntryDir, IndexEntryFile, IndexEntrySymlink } from "./pathindex.ts";

describe("PathIndex", () => {
	describe("construction", () => {
		it("empty paths", () => {
			const ix = PathIndex.from(".", []);
			expect(ix.paths).toEqual([]);
			expect(ix.length).toBe(0);
		});

		it("stores paths", () => {
			const ix = PathIndex.from(".", ["a.go", "pkg/b.go", "pkg/sub/c.go"]);
			expect(ix.paths).toEqual(["a.go", "pkg/b.go", "pkg/sub/c.go"]);
			expect(ix.length).toBe(3);
		});

		it("builds tree from flat paths", () => {
			const ix = PathIndex.from(".", ["src/a.go", "src/b.go", "lib/c.go"]);
			const root = ix.dir(".")!;
			expect(root.children.map((c) => c.name).sort()).toEqual(["lib", "src"]);
			expect(root.children.every((c) => c.type === "dir")).toBe(true);
		});
	});

	describe("globSearch", () => {
		it("returns all paths with no filters", () => {
			const ix = PathIndex.from(".", ["a.go", "b.go", "c.go"]);
			expect(ix.globSearch()).toEqual(["a.go", "b.go", "c.go"]);
		});

		describe("excludes", () => {
			it("excludes by directory glob", () => {
				const ix = PathIndex.from(".", [".git/HEAD", ".git/config", "src/main.go"]);
				expect(ix.globSearch({ excludes: [".git/**"] })).toEqual(["src/main.go"]);
			});

			it("excludes nested directory glob", () => {
				const ix = PathIndex.from(".", ["src/.git/config", "src/main.go"]);
				expect(ix.globSearch({ excludes: ["**/.git/**"] })).toEqual(["src/main.go"]);
			});

			it("excludes by extension glob", () => {
				const ix = PathIndex.from(".", ["main.go", "test.go", "readme.md"]);
				expect(ix.globSearch({ excludes: ["*.md"] })).toEqual(["main.go", "test.go"]);
			});

			it("handles multiple excludes", () => {
				const ix = PathIndex.from(".", [".git/HEAD", "src/main.go", "vendor/pkg/a.go"]);
				expect(ix.globSearch({ excludes: [".git/**", "vendor/**"] })).toEqual(["src/main.go"]);
			});

			it("returns all when excludes is empty", () => {
				const ix = PathIndex.from(".", ["anything.go"]);
				expect(ix.globSearch({ excludes: [] })).toEqual(["anything.go"]);
			});
		});

		describe("includes", () => {
			it("includes by directory glob", () => {
				const ix = PathIndex.from(".", ["lib/cache.go", "src/main.go", "src/util.go"]);
				expect(ix.globSearch({ includes: ["src/**"] })).toEqual(["src/main.go", "src/util.go"]);
			});

			it("includes by multiple globs", () => {
				const ix = PathIndex.from(".", ["lib/foo.go", "src/main.go", "test/bar.go"]);
				expect(ix.globSearch({ includes: ["src/**", "lib/**"] })).toEqual(["lib/foo.go", "src/main.go"]);
			});

			it("includes by extension glob", () => {
				const ix = PathIndex.from(".", ["main.go", "app.tsx", "lib/util.go", "lib/util.tsx"]);
				expect(ix.globSearch({ includes: ["*.tsx"] })).toEqual(["app.tsx", "lib/util.tsx"]);
			});

			it("returns empty when nothing matches", () => {
				const ix = PathIndex.from(".", ["lib/main.go"]);
				expect(ix.globSearch({ includes: ["src/**"] })).toEqual([]);
			});

			it("returns all when includes is empty", () => {
				const ix = PathIndex.from(".", ["src/main.go"]);
				expect(ix.globSearch({ includes: [] })).toEqual(["src/main.go"]);
			});
		});

		it("caps results with maxResults", () => {
			const ix = PathIndex.from(".", ["a.go", "b.go", "c.go", "d.go", "e.go"]);
			expect(ix.globSearch({ maxResults: 3 })).toHaveLength(3);
		});

		it("maxResults zero means no limit", () => {
			const ix = PathIndex.from(".", ["a.go", "b.go", "c.go"]);
			expect(ix.globSearch({ maxResults: 0 })).toHaveLength(3);
		});

		it("combines includes and excludes", () => {
			const ix = PathIndex.from(".", [
				".git/config",
				"src/api/handler.go",
				"src/auth/handler.go",
				"test/auth/handler_test.go",
			]);

			const results = ix.globSearch({
				includes: ["src/**"],
				excludes: [".git/**"],
				maxResults: 10,
			});

			expect(results).toEqual(["src/api/handler.go", "src/auth/handler.go"]);
		});
	});

	describe("fuzzySearch", () => {
		it("finds by filename", () => {
			const ix = PathIndex.from(".", [
				"src/auth/handler.go",
				"src/api/config.go",
				"lib/cache/redis.go",
				"pkg/auth/middleware.go",
			]);
			const results = ix.fuzzySearch("handler");
			expect(results[0]).toBe("src/auth/handler.go");
		});

		it("multi-word waterfall narrows results", () => {
			const ix = PathIndex.from(".", [
				"src/auth/handler.go",
				"src/api/handler.go",
				"src/api/config.go",
				"lib/auth/middleware.go",
			]);
			const results = ix.fuzzySearch("handler auth");
			expect(results[0]).toBe("src/auth/handler.go");
			expect(results).not.toContain("src/api/handler.go");
		});

		it("respects maxResults", () => {
			const ix = PathIndex.from(".", ["a.go", "b.go", "c.go", "d.go", "e.go"]);
			expect(ix.fuzzySearch("go", { maxResults: 2 })).toHaveLength(2);
		});

		it("applies excludes before fuzzy", () => {
			const ix = PathIndex.from(".", ["src/handler.go", "vendor/handler.go"]);
			const results = ix.fuzzySearch("handler", { excludes: ["vendor/**"] });
			expect(results).toEqual(["src/handler.go"]);
		});

		it("applies includes before fuzzy", () => {
			const ix = PathIndex.from(".", ["src/handler.go", "lib/handler.go"]);
			const results = ix.fuzzySearch("handler", { includes: ["src/**"] });
			expect(results).toEqual(["src/handler.go"]);
		});
	});

	describe("dir", () => {
		const ix = PathIndex.from(".", ["README.md", "lib/cache.go", "main.go", "src/bar/baz.go", "src/foo.go"]);

		it("returns root via dot", () => {
			const root = ix.dir(".");
			expect(root).toBeDefined();
			expect(root?.children.map((c) => c.name).sort()).toEqual(["README.md", "lib", "main.go", "src"]);
		});

		it("returns root via empty string", () => {
			expect(ix.dir("")).toBe(ix.dir("."));
		});

		it("looks up subdirectory", () => {
			const src = ix.dir("src");
			expect(src?.name).toBe("src");
			expect(src?.children.map((c) => c.name).sort()).toEqual(["bar", "foo.go"]);
		});

		it("looks up nested subdirectory", () => {
			const bar = ix.dir("src/bar");
			expect(bar?.name).toBe("bar");
		});

		it("strips trailing slash", () => {
			expect(ix.dir("src/")).toBe(ix.dir("src"));
		});

		it("returns undefined for nonexistent path", () => {
			expect(ix.dir("nope")).toBeUndefined();
		});

		it("returns undefined for file path", () => {
			expect(ix.dir("README.md")).toBeUndefined();
		});

		it("explicit empty directory", () => {
			const ix2 = PathIndex.from(".", ["src/", "src/sub/", "main.go"]);
			const sub = ix2.dir("src/sub");
			expect(sub).toBeDefined();
			expect(sub?.children).toEqual([]);
		});

		it("explicit dir mixed with files", () => {
			const ix2 = PathIndex.from(".", ["vendor/", "vendor/lib.go", "main.go"]);
			const vendor = ix2.dir("vendor");
			expect(vendor?.children.map((c) => c.name)).toEqual(["lib.go"]);
		});

		it("explicit dir in paths without trailing slash", () => {
			const ix2 = PathIndex.from(".", ["empty/", "file.go"]);
			expect(ix2.paths).toContain("empty");
			expect(ix2.paths).not.toContain("empty/");
		});
	});

	describe("get", () => {
		const ix = PathIndex.from(".", ["src/main.go", "lib/util.go"]);

		it("returns file entry by path", () => {
			const entry = ix.get("src/main.go");
			expect(entry?.type).toBe("file");
			expect(entry?.name).toBe("main.go");
		});

		it("returns dir entry by path", () => {
			const entry = ix.get("src");
			expect(entry?.type).toBe("dir");
		});

		it("returns undefined for unknown path", () => {
			expect(ix.get("nope")).toBeUndefined();
		});
	});

	describe("validateGlobs", () => {
		it("returns undefined for valid patterns", () => {
			expect(validateGlobs(["*.go", "src/**", "**/*.tsx"])).toBeUndefined();
		});

		it("returns undefined for empty array", () => {
			expect(validateGlobs([])).toBeUndefined();
		});
	});
});

async function createFiles(root: string, paths: string[]): Promise<void> {
	for (const p of paths) {
		const fullPath = join(root, p);
		await mkdir(dirname(fullPath), { recursive: true });
		await writeFile(fullPath, "x");
	}
}

describe("PathIndex.new", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "pathindex-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true });
	});

	it("empty directory", async () => {
		const ix = await PathIndex.new(tempDir);
		expect(ix.paths).toEqual([]);
		expect(ix.length).toBe(0);
	});

	it("flat files", async () => {
		await createFiles(tempDir, ["a.go", "README.md"]);
		const ix = await PathIndex.new(tempDir);
		expect(ix.paths).toEqual(expect.arrayContaining(["a.go", "README.md"]));
		expect(ix.length).toBe(2);
	});

	it("nested files", async () => {
		await createFiles(tempDir, ["top.go", "pkg/a.go", "pkg/sub/b.go", "pkg/sub/deeper/c.go"]);
		const ix = await PathIndex.new(tempDir);
		expect(ix.paths).toEqual(expect.arrayContaining(["top.go", "pkg/a.go", "pkg/sub/b.go", "pkg/sub/deeper/c.go"]));
		expect(ix.length).toBe(4);
	});

	it("excludes .git directory", async () => {
		await createFiles(tempDir, [
			"src/main.go",
			".git/HEAD",
			".git/objects/ab/cdef",
			"node_modules/lib/index.js",
			".hidden",
		]);
		const ix = await PathIndex.new(tempDir);
		expect(ix.paths).toEqual(expect.arrayContaining(["src/main.go", "node_modules/lib/index.js", ".hidden"]));
		expect(ix.paths.filter((p) => p.startsWith(".git/"))).toHaveLength(0);
		expect(ix.length).toBe(3);
	});

	it("returns paths in sorted order", async () => {
		await createFiles(tempDir, ["c.go", "a.go", "b.go"]);
		const ix = await PathIndex.new(tempDir);
		expect(ix.paths).toEqual(["a.go", "b.go", "c.go"]);
	});

	it("sorts paths lexicographically", async () => {
		await createFiles(tempDir, ["z.go", "a/y.go", "a/b/x.go"]);
		const ix = await PathIndex.new(tempDir);
		expect(ix.paths).toEqual(["a/b/x.go", "a/y.go", "z.go"]);
	});

	it("tracks file sizes", async () => {
		await writeFile(join(tempDir, "small.txt"), "hi");
		await writeFile(join(tempDir, "big.txt"), "a".repeat(1000));
		const ix = await PathIndex.new(tempDir);
		const small = ix.get("small.txt") as IndexEntryFile;
		const big = ix.get("big.txt") as IndexEntryFile;
		expect(small.size).toBe(2);
		expect(big.size).toBe(1000);
		expect(ix.get("nonexistent")).toBeUndefined();
	});

	it("counts lines in text files", async () => {
		await writeFile(join(tempDir, "three.txt"), "one\ntwo\nthree\n");
		await writeFile(join(tempDir, "no-trailing.txt"), "one\ntwo");
		const ix = await PathIndex.new(tempDir);
		const three = ix.get("three.txt") as IndexEntryFile;
		const noTrailing = ix.get("no-trailing.txt") as IndexEntryFile;
		expect(three.lineCount).toBe(3);
		expect(three.isBinary).toBe(false);
		expect(noTrailing.lineCount).toBe(2);
		expect(noTrailing.isBinary).toBe(false);
	});

	it("tracks max line length", async () => {
		await writeFile(join(tempDir, "varied.txt"), "short\na longer line here\nhi\n");
		const ix = await PathIndex.new(tempDir);
		const entry = ix.get("varied.txt") as IndexEntryFile;
		expect(entry.maxLineLen).toBe(Buffer.byteLength("a longer line here"));
	});

	it("detects binary files", async () => {
		await writeFile(join(tempDir, "binary.bin"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0a, 0x1a]));
		const ix = await PathIndex.new(tempDir);
		const entry = ix.get("binary.bin") as IndexEntryFile;
		expect(entry.isBinary).toBe(true);
		expect(entry.lineCount).toBe(0);
		expect(entry.maxLineLen).toBe(0);
	});

	it("handles empty files", async () => {
		await writeFile(join(tempDir, "empty.txt"), "");
		const ix = await PathIndex.new(tempDir);
		const entry = ix.get("empty.txt") as IndexEntryFile;
		expect(entry.lineCount).toBe(0);
		expect(entry.maxLineLen).toBe(0);
		expect(entry.isBinary).toBe(false);
	});

	it("builds tree structure", async () => {
		await createFiles(tempDir, ["src/a.go", "src/b.go", "lib/c.go"]);
		const ix = await PathIndex.new(tempDir);
		const src = ix.dir("src") as IndexEntryDir;
		expect(src.type).toBe("dir");
		expect(src.children.filter((c) => c.type === "file")).toHaveLength(2);
	});

	it("indexes symlinks to files", async () => {
		await writeFile(join(tempDir, "real.txt"), "content");
		await symlink(join(tempDir, "real.txt"), join(tempDir, "link.txt"));
		const ix = await PathIndex.new(tempDir);
		expect(ix.paths).toContain("link.txt");
		const entry = ix.get("link.txt") as IndexEntrySymlink;
		expect(entry.type).toBe("symlink");
		expect(entry.targetType).toBe("file");
		expect(entry.size).toBe(7);
	});

	it("indexes symlinks to dirs without recursing", async () => {
		await createFiles(tempDir, ["real/a.go", "real/b.go"]);
		await symlink(join(tempDir, "real"), join(tempDir, "linked"));
		const ix = await PathIndex.new(tempDir);
		const entry = ix.get("linked") as IndexEntrySymlink;
		expect(entry.type).toBe("symlink");
		expect(entry.targetType).toBe("dir");
		expect(ix.paths.filter((p) => p.startsWith("linked/"))).toHaveLength(0);
	});

	it("throws on aborted signal", async () => {
		await createFiles(tempDir, ["a.go"]);
		const controller = new AbortController();
		controller.abort();
		await expect(PathIndex.new(tempDir, controller.signal)).rejects.toThrow();
	});

	it("dir via tree lookup", async () => {
		await createFiles(tempDir, ["main.go", "README.md", "src/foo.go", "src/bar/baz.go", "lib/cache.go"]);
		const ix = await PathIndex.new(tempDir);
		const root = ix.dir(".")!;
		expect(root.children.map((c) => c.name).sort()).toEqual(["README.md", "lib", "main.go", "src"]);
	});
});
