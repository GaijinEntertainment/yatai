import { describe, expect, it } from "vite-plus/test";

import { Element, attr, element } from "./llmxml.ts";

describe("attr rendering", () => {
	it.each([
		{ name: "simple string", key: "name", value: "hello", want: '<x name="hello"/>' },
		{ name: "with spaces", key: "name", value: "hello world", want: '<x name="hello world"/>' },
		{ name: "with quotes", key: "name", value: 'say "hi"', want: '<x name="say \\"hi\\""/>' },
		{ name: "with newline", key: "name", value: "line1\nline2", want: '<x name="line1\\nline2"/>' },
		{ name: "with carriage return", key: "name", value: "a\rb", want: '<x name="a\\rb"/>' },
		{ name: "with tab", key: "name", value: "a\tb", want: '<x name="a\\tb"/>' },
		{ name: "with backslash", key: "name", value: "a\\b", want: '<x name="a\\\\b"/>' },
		{ name: "empty string", key: "name", value: "", want: '<x name=""/>' },
		{ name: "integer", key: "count", value: 42, want: '<x count="42"/>' },
		{ name: "boolean true", key: "draft", value: true, want: '<x draft="true"/>' },
		{ name: "boolean false", key: "draft", value: false, want: '<x draft="false"/>' },
		{ name: "negative integer", key: "score", value: -1, want: '<x score="-1"/>' },
		{ name: "float", key: "ratio", value: 3.14, want: '<x ratio="3.14"/>' },
	])("$name", ({ key, value, want }) => {
		expect(element("x", attr(key, value)).toString()).toBe(want);
	});
});

describe("element", () => {
	it("self-closing no attrs", () => {
		expect(element("br").toString()).toBe("<br/>");
	});

	it("self-closing with attrs", () => {
		const got = element("label", attr("name", "Code-Review"), attr("value", "+1")).toString();
		expect(got).toBe('<label name="Code-Review" value="+1"/>');
	});

	it("inline text", () => {
		const got = element("concern").inlineText("null pointer dereference").toString();
		expect(got).toBe("<concern>null pointer dereference</concern>");
	});

	it("wrapped single child", () => {
		const inner = element("verdict", attr("status", "pass")).toString();
		const got = element("finding", attr("id", "F1")).wrapText(inner).toString();
		expect(got).toBe('<finding id="F1">\n<verdict status="pass"/>\n</finding>');
	});

	it("wrapped multiple children", () => {
		const concern = element("concern").inlineText("race condition").toString();
		const verdict = element("verdict", attr("status", "drop")).inlineText("\ninsufficient evidence").toString();

		const got = element("finding", attr("id", "F2"), attr("kind", "bug"))
			.wrapText(concern + "\n" + verdict)
			.toString();

		const want =
			'<finding id="F2" kind="bug">' +
			"\n<concern>race condition</concern>" +
			'\n<verdict status="drop">\ninsufficient evidence</verdict>' +
			"\n</finding>";
		expect(got).toBe(want);
	});

	it("addAttr before content", () => {
		const e = element("change", attr("author", "alice"));
		e.addAttr(attr("draft", true));
		expect(e.toString()).toBe('<change author="alice" draft="true"/>');
	});

	it("addAttr after content", () => {
		const e = element("change").inlineText("fix");
		e.addAttr(attr("scope", "auth"));
		expect(e.toString()).toBe('<change scope="auth">fix</change>');
	});

	it("wrapped empty element", () => {
		const got = element("parent").wrapText(element("empty").toString()).toString();
		expect(got).toBe("<parent>\n<empty/>\n</parent>");
	});

	it("Element.create is equivalent to element()", () => {
		const a = element("tag", attr("k", "v")).toString();
		const b = Element.create("tag", attr("k", "v")).toString();
		expect(a).toBe(b);
	});

	it("throws on double inlineText", () => {
		expect(() => element("x").inlineText("a").inlineText("b")).toThrow("content already set");
	});

	it("throws on double wrapText", () => {
		expect(() => element("x").wrapText("a").wrapText("b")).toThrow("content already set");
	});

	it("throws on wrapText after inlineText", () => {
		expect(() => element("x").inlineText("a").wrapText("b")).toThrow("content already set");
	});

	it("throws on inlineText after wrapText", () => {
		expect(() => element("x").wrapText("a").inlineText("b")).toThrow("content already set");
	});
});
