import path from "node:path/posix";

import { type MatchResult, type Pattern, parsePattern } from "./pattern.ts";

export type { MatchResult, Pattern };
export { parsePattern };

export class Matcher {
	readonly #patterns: readonly Pattern[];
	readonly #parent: Matcher | null;

	constructor(patterns: Pattern[], parent: Matcher | null = null) {
		this.#patterns = patterns;
		this.#parent = parent;
	}

	match(relPath: string, isDir: boolean): boolean {
		return Matcher.#walk(this, relPath, isDir);
	}

	static #walk(start: Matcher, relPath: string, isDir: boolean): boolean {
		const name = path.basename(relPath);

		for (let cur: Matcher | null = start; cur != null; cur = cur.#parent) {
			for (let i = cur.#patterns.length - 1; i >= 0; i--) {
				const result = cur.#patterns[i]!.match(relPath, name, isDir);
				if (result === "exclude") return true;
				if (result === "include") return false;
			}
		}

		return false;
	}

	append(...patterns: Pattern[]): Matcher {
		if (patterns.length === 0) return this;
		return new Matcher(patterns, this);
	}

	withParent(parent: Matcher | null): Matcher | null {
		if (this.#patterns.length === 0) return parent;
		return new Matcher([...this.#patterns], parent);
	}
}

export function parse(content: string, dir: string): Matcher {
	const patterns: Pattern[] = [];

	for (const line of content.split("\n")) {
		const p = parsePattern(line, dir);
		if (p) patterns.push(p);
	}

	return new Matcher(patterns);
}
