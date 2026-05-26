import { z } from "zod";

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
const PAGE_BUDGET = 350_000;
const BLOCK_CAP = 480_000;
const FOOTER_RESERVE = 200;

const inputSchema = z.object({
	page: z.number().int().positive().optional().describe("Page number (1-based). Defaults to 1."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: PrimingContext, args: Input) {
	const s = ctx.getSession();
	if (!s) return err("[no active session]");

	const { base, head } = resolveRefs(s.mode);
	const headLabel = head ?? "working tree";

	const allBlocks = buildAllBlocks(s, base, headLabel);
	const pages = paginate(allBlocks, PAGE_BUDGET - FOOTER_RESERVE);
	const pageNum = Math.max(1, Math.min(args.page ?? 1, pages.length));
	const page = pages[pageNum - 1]!;

	if (pages.length > 1) {
		const status =
			pageNum < pages.length
				? `[page ${pageNum} of ${pages.length} — call session_priming(page=${pageNum + 1}) for next]`
				: `[page ${pageNum} of ${pages.length} — complete]`;
		page.push(status);
	}

	return ok(...page);
}

function buildAllBlocks(s: Session, base: string, head: string): string[] {
	const blocks: string[] = [];

	blocks.push(renderMetadata(s, base, head));
	blocks.push(renderChangedFiles(base, head, s.changedFiles));
	blocks.push(renderFileStats(s.manifest));

	for (const inst of s.instructions) {
		blocks.push(renderInstruction(inst));
	}

	for (const d of s.diffs) {
		blocks.push(renderDiff(d, base, head));
	}

	return blocks;
}

function capBlock(block: string): string {
	if (block.length <= BLOCK_CAP) return block;
	const marker = "\n\n[content truncated — file too large for priming, use diff_file to read in full]";
	return block.slice(0, BLOCK_CAP - marker.length) + marker;
}

function paginate(blocks: string[], budget: number): string[][] {
	const pages: string[][] = [];
	let current: string[] = [];
	let used = 0;

	for (const block of blocks) {
		const capped = capBlock(block);
		if (current.length > 0 && used + capped.length > budget) {
			pages.push(current);
			current = [];
			used = 0;
		}
		current.push(capped);
		used += capped.length;
	}

	if (current.length > 0) {
		pages.push(current);
	}

	return pages.length > 0 ? pages : [[]];
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
						"Returns full review context as paginated content blocks.",
						"",
						"Behaviour:",
						"  - Multi-block response. Each block is a separate content item.",
						"  - Block 1: LLMXML <change> with commit metadata and refs.",
						"  - Block 2: Plain text changed-files table.",
						"  - Block 3: File shape metrics.",
						"  - Block 4+: <agent-instruction> blocks from directory chains.",
						"  - Remaining: One per diff -- annotated unified diff per changed file.",
						"  - Large changes are paginated. Footer shows current page and total.",
						"    Call session_priming(page=N) for subsequent pages.",
						"  - Small changes fit in one page (no footer).",
						"",
						"Use this tool as the first call in any review phase. Request all pages.",
					].join("\n"),
					inputSchema,
					annotations: { readOnlyHint: true },
					_meta: { "anthropic/maxResultSizeChars": 500_000 },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
