import picomatch from "picomatch";

export type MatchResult = "no-match" | "exclude" | "include";

export interface Pattern {
	match(relPath: string, name: string, isDir: boolean): MatchResult;
}

export function parsePattern(line: string, dir: string): Pattern | null {
	const parsed = parseLine(line);
	if (!parsed) return null;

	const { negated, dirOnly, isPath, cleanLine } = parsed;
	const matcher = compileMatcher(isPath, cleanLine, dir);
	if (!matcher) return null;

	return {
		match(relPath: string, name: string, isDir: boolean): MatchResult {
			if (dirOnly && !isDir) return "no-match";

			const target = isPath ? relPath : name;
			if (matcher(target)) return negated ? "include" : "exclude";

			return "no-match";
		},
	};
}

interface ParsedLine {
	negated: boolean;
	dirOnly: boolean;
	isPath: boolean;
	cleanLine: string;
}

function parseLine(line: string): ParsedLine | null {
	line = trimTrailingWhitespace(line);

	if (line === "" || line.startsWith("#")) return null;

	const flags = parseFlags(line);
	if (flags.cleanLine === "") return null;

	return flags;
}

function parseFlags(line: string): ParsedLine {
	let negated = false;
	let dirOnly = false;

	if (line.startsWith("!")) {
		negated = true;
		line = line.slice(1);
	}

	if (line.startsWith("\\#") || line.startsWith("\\!")) {
		line = line.slice(1);
	}

	if (line.endsWith("/")) {
		dirOnly = true;
		while (line.endsWith("/")) line = line.slice(0, -1);
	}

	const hasLeadingSlash = line.startsWith("/");
	if (hasLeadingSlash) {
		line = line.slice(1);
	}

	if (line.startsWith("**/")) {
		const rest = line.slice(3);
		if (!rest.includes("/") && !hasLeadingSlash) {
			return { negated, dirOnly, isPath: false, cleanLine: rest };
		}
	}

	const isPath = hasLeadingSlash || line.includes("/");

	return { negated, dirOnly, isPath, cleanLine: line };
}

/**
 * Strips unescaped trailing spaces and tabs.
 * A trailing `\ ` (backslash-space) preserves one space. Even
 * backslash count (`\\ `) means the backslash itself is escaped and
 * the trailing space is unescaped — it gets stripped.
 */
function trimTrailingWhitespace(line: string): string {
	let end = line.length;
	while (end > 0 && (line[end - 1] === " " || line[end - 1] === "\t")) end--;

	if (end === line.length) return line;

	const trimmed = line.slice(0, end);

	let backslashes = 0;
	for (let i = trimmed.length - 1; i >= 0 && trimmed[i] === "\\"; i--) {
		backslashes++;
	}

	if (backslashes % 2 === 1) return trimmed + " ";

	return trimmed;
}

// picomatch uses [^abc] for negated character classes; gitignore uses [!abc].
function normalizeCharClasses(pattern: string): string {
	return pattern.replaceAll("[!", "[^");
}

// Gitignore globs match dotfiles and have no brace expansion or extglob syntax.
const PICOMATCH_OPTIONS: picomatch.PicomatchOptions = { dot: true, nobrace: true, noextglob: true };

function compileMatcher(isPath: boolean, line: string, dir: string): picomatch.Matcher | null {
	line = normalizeCharClasses(line);

	if (!isPath) {
		try {
			return picomatch(line, PICOMATCH_OPTIONS);
		} catch {
			return null;
		}
	}

	if (dir === ".") dir = "";

	let full = line;
	if (dir) full = `${dir}/${line}`;

	try {
		return picomatch(full, PICOMATCH_OPTIONS);
	} catch {
		return null;
	}
}
