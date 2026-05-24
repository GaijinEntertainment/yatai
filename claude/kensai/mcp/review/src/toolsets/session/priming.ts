import { element, attr } from "../../llmxml/llmxml.ts";
import type { GitFileStat } from "../../repofs/git/git.ts";
import { renderInstruction } from "../../session/instructions.ts";
import type { FileDiff, ManifestEntry, Session } from "../../session/session.ts";
import { resolveRefs } from "../../session/session.ts";
import { ok, err } from "../result.ts";
import type { ToolRegistrar } from "../types.ts";

export interface PrimingContext {
	getSession(): Session | null;
}

const COLLAPSED_PREFIXES = ["vendor/", "node_modules/", "dist/", "build/", "__pycache__/", ".git/"];

function handle(ctx: PrimingContext) {
	const s = ctx.getSession();
	if (!s) return err("[no active session]");

	const { base, head } = resolveRefs(s.mode);
	const headLabel = head ?? "working tree";
	const blocks: string[] = [];

	blocks.push(renderMetadata(s, base, headLabel));
	blocks.push(renderChangedFiles(base, headLabel, s.changedFiles));
	blocks.push(renderFileStats(s.manifest));

	for (const inst of s.instructions) {
		blocks.push(renderInstruction(inst));
	}

	for (const d of s.diffs) {
		blocks.push(renderDiff(d, base, headLabel));
	}

	return ok(...blocks);
}

function renderMetadata(s: Session, base: string, head: string): string {
	const parts: string[] = [];

	if (s.commit) {
		const sha = s.commit.sha.slice(0, 7);
		const commitEl = element("commit", attr("sha", sha), attr("author", s.commit.author));
		const body = s.commit.body ? s.commit.subject + "\n" + s.commit.body : s.commit.subject;
		parts.push(commitEl.wrapText(body).toString());
	}

	const refsEl = element("refs", attr("base", base), attr("head", head)).toString();
	parts.push(refsEl);

	return element("change", attr("mode", s.mode), attr("files", s.changedFiles.length))
		.wrapText(parts.join("\n"))
		.toString();
}

function renderChangedFiles(base: string, head: string, files: readonly GitFileStat[]): string {
	const header = `git diff ${base}..${head}: ${files.length} files changed\n`;
	if (files.length === 0) return header + "[no files changed]\n";

	const collapsed = new Map<string, { count: number; additions: number; deletions: number }>();
	const individual: GitFileStat[] = [];

	for (const f of files) {
		const prefix = COLLAPSED_PREFIXES.find((p) => f.path.startsWith(p));
		if (prefix) {
			const cf = collapsed.get(prefix) ?? { count: 0, additions: 0, deletions: 0 };
			cf.count++;
			cf.additions += f.additions;
			cf.deletions += f.deletions;
			collapsed.set(prefix, cf);
		} else {
			individual.push(f);
		}
	}

	let body = header;

	for (const [prefix, cf] of [...collapsed.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
		body += `[collapsed] ${prefix} (${cf.count} files, +${cf.additions}/-${cf.deletions})\n`;
	}

	if (individual.length > 0) {
		const maxPath = individual.reduce((m, f) => Math.max(m, f.path.length), 0);
		for (const f of individual) {
			const status = f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M";
			body += `${status}  ${f.path.padEnd(maxPath)}  +${f.additions}/-${f.deletions}\n`;
		}
	}

	return body;
}

function renderFileStats(manifest: readonly ManifestEntry[]): string {
	if (manifest.length === 0) return "File shape metrics: [no files]\n";

	let body = `File shape metrics for ${manifest.length} changed files:\n`;

	for (const m of manifest) {
		if (m.binary) {
			body += `${m.path} bytes=${m.bytes} binary\n`;
		} else {
			body += `${m.path} bytes=${m.bytes} lines=${m.lines} max_line=${m.maxLineLen}\n`;
		}
	}

	return body;
}

function renderDiff(d: FileDiff, base: string, head: string): string {
	return `Diff for ${d.path} (base=${base} head=${head}):\n${d.content}`;
}

export function sessionPrimingTool(ctx: PrimingContext): ToolRegistrar {
	return {
		name: "session_priming",
		register(server) {
			return server.registerTool(
				"session_priming",
				{
					description: [
						"Returns full review context as separate content blocks.",
						"",
						"Behaviour:",
						"  - Multi-block response. Each block is a separate content item.",
						"  - Block 1: LLMXML <change> with commit metadata and refs.",
						"  - Block 2: Plain text changed-files table (same format as changed_files tool).",
						"  - Block 3: File shape metrics -- path, bytes, lines, max_line per file.",
						"  - Block 4+: <agent-instruction> blocks -- project conventions (CLAUDE.md, AGENTS.md) from directory chains.",
						"  - Remaining: One per diff -- annotated unified diff per changed file.",
						"  - Large results (>500K chars) may be persisted to disk by the harness; agents can read individual diffs via diff_file.",
						"",
						"Use this tool as the first call in any review phase to receive full context.",
					].join("\n"),
					annotations: { readOnlyHint: true },
					_meta: { "anthropic/maxResultSizeChars": 500_000 },
				},
				() => handle(ctx),
			);
		},
	};
}
