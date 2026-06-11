import { describe, expect, it } from "vite-plus/test";

import { parsePattern } from "./pattern.ts";

describe("parsePattern — blank lines", () => {
	it.each(["", "   ", "\t"])("rejects %j", (line) => {
		expect(parsePattern(line, "")).toBeNull();
	});
});

describe("parsePattern — comments", () => {
	it("rejects comment", () => {
		expect(parsePattern("# this is a comment", "")).toBeNull();
	});
});

describe("parsePattern — escaped hash", () => {
	it("matches literal #", () => {
		const p = parsePattern("\\#readme", "")!;
		expect(p).not.toBeNull();
		expect(p.match("#readme", "#readme", false)).toBe("exclude");
	});
});

describe("parsePattern — trailing spaces", () => {
	it("strips unescaped trailing spaces", () => {
		const p = parsePattern("*.log   ", "")!;
		expect(p).not.toBeNull();
		expect(p.match("debug.log", "debug.log", false)).toBe("exclude");
	});

	it("preserves escaped trailing space", () => {
		const p = parsePattern("pattern\\ ", "")!;
		expect(p).not.toBeNull();
		expect(p.match("pattern ", "pattern ", false)).toBe("exclude");
		expect(p.match("pattern", "pattern", false)).toBe("no-match");
	});

	it("interior spaces preserved with escaped trailing space", () => {
		const p = parsePattern("pattern  \\ ", "")!;
		expect(p).not.toBeNull();
		expect(p.match("pattern   ", "pattern   ", false)).toBe("exclude");
		expect(p.match("pattern ", "pattern ", false)).toBe("no-match");
	});

	it("even backslash count — trailing space is unescaped and stripped", () => {
		const p = parsePattern("pattern\\\\ ", "")!;
		expect(p).not.toBeNull();
		expect(p.match("pattern\\", "pattern\\", false)).toBe("exclude");
		expect(p.match("pattern\\ ", "pattern\\ ", false)).toBe("no-match");
	});

	it("triple backslash — odd count preserves trailing space", () => {
		const p = parsePattern("pattern\\\\\\ ", "")!;
		expect(p).not.toBeNull();
		expect(p.match("pattern\\ ", "pattern\\ ", false)).toBe("exclude");
	});
});

describe("parsePattern — negation", () => {
	it("negated pattern returns include", () => {
		const p = parsePattern("!important.log", "")!;
		expect(p).not.toBeNull();
		expect(p.match("important.log", "important.log", false)).toBe("include");
	});

	it("escaped bang is literal", () => {
		const p = parsePattern("\\!important", "")!;
		expect(p).not.toBeNull();
		expect(p.match("!important", "!important", false)).toBe("exclude");
	});

	it("negation then empty is invalid", () => {
		expect(parsePattern("!/", "")).toBeNull();
	});
});

describe("parsePattern — dirOnly", () => {
	it("matches directory", () => {
		const p = parsePattern("build/", "")!;
		expect(p).not.toBeNull();
		expect(p.match("build", "build", true)).toBe("exclude");
	});

	it("skips file", () => {
		const p = parsePattern("build/", "")!;
		expect(p).not.toBeNull();
		expect(p.match("build", "build", false)).toBe("no-match");
	});

	it("dirOnly path pattern", () => {
		const p = parsePattern("build/cache/", "")!;
		expect(p).not.toBeNull();
		expect(p.match("build/cache", "cache", true)).toBe("exclude");
		expect(p.match("build/cache", "cache", false)).toBe("no-match");
	});
});

describe("parsePattern — wildcards", () => {
	it("star glob", () => {
		const p = parsePattern("*.log", "")!;
		expect(p).not.toBeNull();
		expect(p.match("output.log", "output.log", false)).toBe("exclude");
		expect(p.match("main.go", "main.go", false)).toBe("no-match");
	});

	it("question mark", () => {
		const p = parsePattern("?.log", "")!;
		expect(p).not.toBeNull();
		expect(p.match("a.log", "a.log", false)).toBe("exclude");
		expect(p.match("ab.log", "ab.log", false)).toBe("no-match");
	});

	it("character class", () => {
		const p = parsePattern("*.[oa]", "")!;
		expect(p).not.toBeNull();
		expect(p.match("foo.o", "foo.o", false)).toBe("exclude");
		expect(p.match("foo.a", "foo.a", false)).toBe("exclude");
		expect(p.match("foo.c", "foo.c", false)).toBe("no-match");
	});

	it("negated character class", () => {
		const p = parsePattern("[!abc].txt", "")!;
		expect(p).not.toBeNull();
		expect(p.match("d.txt", "d.txt", false)).toBe("exclude");
		expect(p.match("a.txt", "a.txt", false)).toBe("no-match");
	});

	it("star matches dotfiles", () => {
		const p = parsePattern("*.log", "")!;
		expect(p).not.toBeNull();
		expect(p.match(".secret.log", ".secret.log", false)).toBe("exclude");
	});

	it("braces are literal, not expanded", () => {
		const p = parsePattern("file.{js,ts}", "")!;
		expect(p).not.toBeNull();
		expect(p.match("file.js", "file.js", false)).toBe("no-match");
		expect(p.match("file.{js,ts}", "file.{js,ts}", false)).toBe("exclude");
	});
});

describe("parsePattern — exact name", () => {
	it("matches exact basename", () => {
		const p = parsePattern("node_modules", "")!;
		expect(p).not.toBeNull();
		expect(p.match("node_modules", "node_modules", false)).toBe("exclude");
		expect(p.match("vendor", "vendor", false)).toBe("no-match");
	});
});

describe("parsePattern — basename matches any depth", () => {
	it("basename pattern matches at any depth", () => {
		const p = parsePattern("*.log", "")!;
		expect(p).not.toBeNull();
		expect(p.match("debug.log", "debug.log", false)).toBe("exclude");
		expect(p.match("src/debug.log", "debug.log", false)).toBe("exclude");
		expect(p.match("a/b/c/debug.log", "debug.log", false)).toBe("exclude");
	});
});

describe("parsePattern — path patterns", () => {
	it("path pattern is anchored", () => {
		const p = parsePattern("build/output.log", "")!;
		expect(p).not.toBeNull();
		expect(p.match("build/output.log", "output.log", false)).toBe("exclude");
		expect(p.match("src/build/output.log", "output.log", false)).toBe("no-match");
	});

	it("leading slash anchors to root", () => {
		const p = parsePattern("/TODO", "")!;
		expect(p).not.toBeNull();
		expect(p.match("TODO", "TODO", false)).toBe("exclude");
		expect(p.match("src/TODO", "TODO", false)).toBe("no-match");
	});

	it("leading slash with dir", () => {
		const p = parsePattern("/TODO", "src")!;
		expect(p).not.toBeNull();
		expect(p.match("src/TODO", "TODO", false)).toBe("exclude");
		expect(p.match("TODO", "TODO", false)).toBe("no-match");
	});
});

describe("parsePattern — double star", () => {
	it("leading /** with leading slash at root", () => {
		const p = parsePattern("/**/foo", "")!;
		expect(p).not.toBeNull();
		expect(p.match("foo", "foo", false)).toBe("exclude");
		expect(p.match("a/b/foo", "foo", false)).toBe("exclude");
		expect(p.match("bar", "bar", false)).toBe("no-match");
	});

	it("leading /** with leading slash and dir", () => {
		const p = parsePattern("/**/foo", "src")!;
		expect(p).not.toBeNull();
		expect(p.match("src/foo", "foo", false)).toBe("exclude");
		expect(p.match("src/a/b/foo", "foo", false)).toBe("exclude");
		expect(p.match("other/foo", "foo", false)).toBe("no-match");
	});

	it("leading ** as basename", () => {
		const p = parsePattern("**/foo", "")!;
		expect(p).not.toBeNull();
		expect(p.match("foo", "foo", false)).toBe("exclude");
		expect(p.match("a/foo", "foo", false)).toBe("exclude");
		expect(p.match("a/b/c/foo", "foo", false)).toBe("exclude");
	});

	it("leading ** with extension", () => {
		const p = parsePattern("**/*.log", "")!;
		expect(p).not.toBeNull();
		expect(p.match("output.log", "output.log", false)).toBe("exclude");
		expect(p.match("a/output.log", "output.log", false)).toBe("exclude");
		expect(p.match("a/b/c/output.log", "output.log", false)).toBe("exclude");
	});

	it("leading ** with dir", () => {
		const p = parsePattern("**/foo", "src")!;
		expect(p).not.toBeNull();
		expect(p.match("src/foo", "foo", false)).toBe("exclude");
		expect(p.match("src/a/b/foo", "foo", false)).toBe("exclude");
	});

	it("leading ** path fallback", () => {
		const p = parsePattern("**/test/*.go", "")!;
		expect(p).not.toBeNull();
		expect(p.match("test/foo.go", "foo.go", false)).toBe("exclude");
		expect(p.match("a/test/foo.go", "foo.go", false)).toBe("exclude");
		expect(p.match("a/b/test/foo.go", "foo.go", false)).toBe("exclude");
	});

	it("trailing **", () => {
		const p = parsePattern("doc/**", "")!;
		expect(p).not.toBeNull();
		expect(p.match("doc/a.txt", "a.txt", false)).toBe("exclude");
		expect(p.match("doc/x/y/a.txt", "a.txt", false)).toBe("exclude");
	});

	it("middle **", () => {
		const p = parsePattern("a/**/b", "")!;
		expect(p).not.toBeNull();
		expect(p.match("a/b", "b", false)).toBe("exclude");
		expect(p.match("a/x/b", "b", false)).toBe("exclude");
		expect(p.match("a/x/y/b", "b", false)).toBe("exclude");
	});
});

describe("parsePattern — dir scoping", () => {
	it("path pattern scoped to dir", () => {
		const p = parsePattern("build/output.log", "src/pkg")!;
		expect(p).not.toBeNull();
		expect(p.match("src/pkg/build/output.log", "output.log", false)).toBe("exclude");
		expect(p.match("build/output.log", "output.log", false)).toBe("no-match");
		expect(p.match("other/build/output.log", "output.log", false)).toBe("no-match");
	});
});
