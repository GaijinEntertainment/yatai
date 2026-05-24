import type { GitFileStat } from "../../repofs/git/git.ts";
import { resolveRefs } from "../../session/session.ts";
import { ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const COLLAPSED_PREFIXES = ["vendor/", "node_modules/", "dist/", "build/", "__pycache__/"];

interface CollapsedFolder {
	prefix: string;
	count: number;
	additions: number;
	deletions: number;
}

function statusLetter(status: string): string {
	switch (status) {
		case "added":
			return "A";
		case "deleted":
			return "D";
		default:
			return "M";
	}
}

function matchPrefix(path: string): string | undefined {
	return COLLAPSED_PREFIXES.find((p) => path.startsWith(p));
}

function partition(files: readonly GitFileStat[]): { collapsed: CollapsedFolder[]; individual: GitFileStat[] } {
	const folders = new Map<string, CollapsedFolder>();
	const individual: GitFileStat[] = [];

	for (const f of files) {
		const prefix = matchPrefix(f.path);
		if (!prefix) {
			individual.push(f);
			continue;
		}
		let cf = folders.get(prefix);
		if (!cf) {
			cf = { prefix, count: 0, additions: 0, deletions: 0 };
			folders.set(prefix, cf);
		}
		cf.count++;
		cf.additions += f.additions;
		cf.deletions += f.deletions;
	}

	const sorted = [...folders.values()].sort((a, b) => a.prefix.localeCompare(b.prefix));
	return { collapsed: sorted, individual };
}

function render(base: string, head: string, files: readonly GitFileStat[]): string {
	const header = `git diff ${base}..${head}: ${files.length} files changed\n`;

	if (files.length === 0) return header + "[no files changed]\n";

	const { collapsed, individual } = partition(files);

	let body = header;

	for (const cf of collapsed) {
		body += `[collapsed] ${cf.prefix} (${cf.count} files, +${cf.additions}/-${cf.deletions})\n`;
	}

	if (individual.length === 0) return body;

	const maxPath = individual.reduce((m, f) => Math.max(m, f.path.length), 0);

	for (const f of individual) {
		body += `${statusLetter(f.status)}  ${f.path.padEnd(maxPath)}  +${f.additions}/-${f.deletions}\n`;
	}

	return body;
}

function handle(ctx: ToolContext) {
	const session = ctx.session();
	const { base, head } = resolveRefs(session.mode);
	const headLabel = head ?? "working tree";

	return ok(render(base, headLabel, session.changedFiles));
}

export function changedFilesTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "changed_files",
		register(server) {
			return server.registerTool(
				"changed_files",
				{
					description: [
						"List files changed in the review with status (A/M/D) and +A/-D counts. Use diff_file for one file's diff, log for commit history.",
						"",
						"Reach for alternatives instead when:",
						"  - You want one file's full diff -> diff_file.",
						"  - You want recent commit history -> log.",
						"",
						"Behaviour:",
						"  - Uses the session's review mode refs (committed: HEAD~1..HEAD, uncommitted: HEAD..worktree, all: HEAD~1..worktree).",
						'  - Header line: "git diff base..head: N files changed". Then collapsed summaries, then per-file rows.',
						'  - Per-file row: "<status>  <path>  +A/-D" where status is A (added), M (modified), or D (deleted).',
						`  - Paths under ${COLLAPSED_PREFIXES.join(", ")} fold into "[collapsed] <prefix> (N files, +A/-D)" rows.`,
						'  - Empty change set emits "[no files changed]".',
					].join("\n"),
					annotations: { readOnlyHint: true },
				},
				() => handle(ctx),
			);
		},
	};
}
