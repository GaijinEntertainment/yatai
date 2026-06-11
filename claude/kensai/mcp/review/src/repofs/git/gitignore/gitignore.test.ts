import { describe, expect, it } from "vite-plus/test";

import { Matcher, parse, parsePattern } from "./gitignore.ts";

describe("parse", () => {
	it("parses mixed content", () => {
		const content = ["# comment", "", "*.log", "build/", "!important.log", "  ", "doc/**/*.pdf"].join("\n");

		const m = parse(content, "");

		expect(m.match("debug.log", false)).toBe(true);
		expect(m.match("build", true)).toBe(true);
		expect(m.match("build", false)).toBe(false);
		expect(m.match("important.log", false)).toBe(false);
		expect(m.match("doc/ref/manual.pdf", false)).toBe(true);
		expect(m.match("main.go", false)).toBe(false);
	});

	it("parses with dir scoping", () => {
		const content = "build/output.log\n**/test\n";
		const m = parse(content, "src/pkg");

		expect(m.match("src/pkg/build/output.log", false)).toBe(true);
		expect(m.match("build/output.log", false)).toBe(false);
		expect(m.match("src/pkg/test", true)).toBe(true);
		expect(m.match("src/pkg/a/b/test", true)).toBe(true);
	});
});

describe("Matcher — last match wins", () => {
	it("negation overrides earlier exclude", () => {
		const p1 = parsePattern("*.log", "")!;
		const p2 = parsePattern("!important.log", "")!;
		const m = new Matcher([p1, p2]);

		expect(m.match("important.log", false)).toBe(false);
		expect(m.match("debug.log", false)).toBe(true);
		expect(m.match("main.go", false)).toBe(false);
	});
});

describe("Matcher — append", () => {
	it("child overrides parent immutably", () => {
		const p1 = parsePattern("*.log", "")!;
		const parent = new Matcher([p1]);

		const p2 = parsePattern("!important.log", "")!;
		const child = parent.append(p2);

		expect(parent.match("important.log", false)).toBe(true);
		expect(child.match("important.log", false)).toBe(false);
	});

	it("append on empty returns new matcher", () => {
		const p1 = parsePattern("*.log", "")!;
		const m = new Matcher([]);
		const result = m.append(p1);

		expect(result).not.toBe(m);
		expect(result.match("debug.log", false)).toBe(true);
	});

	it("append with no patterns returns same instance", () => {
		const p1 = parsePattern("*.log", "")!;
		const m = new Matcher([p1]);
		expect(m.append()).toBe(m);
	});
});

describe("Matcher — withParent", () => {
	it("child overrides parent", () => {
		const parent = parse("*.log\n", "");
		const child = parse("!important.log\n", "");
		const chained = child.withParent(parent);

		expect(chained!.match("important.log", false)).toBe(false);
		expect(chained!.match("debug.log", false)).toBe(true);
	});

	it("empty child returns parent", () => {
		const parent = parse("*.log\n", "");
		const child = new Matcher([]);
		const result = child.withParent(parent);

		expect(result).toBe(parent);
	});

	it("child with null parent works", () => {
		const child = parse("*.log\n", "");
		const result = child.withParent(null);

		expect(result).not.toBeNull();
		expect(result!.match("debug.log", false)).toBe(true);
	});
});

describe("Matcher — empty", () => {
	it("empty matcher matches nothing", () => {
		const m = new Matcher([]);
		expect(m.match("anything", false)).toBe(false);
	});
});
