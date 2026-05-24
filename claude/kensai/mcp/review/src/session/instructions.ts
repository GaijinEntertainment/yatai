import path from "node:path";

import { element, attr } from "../llmxml/llmxml.ts";
import type { RepoFs } from "../repofs/repofs.ts";

const INSTRUCTION_FILENAMES = ["CLAUDE.md", "AGENTS.md"];

export interface Instruction {
	readonly path: string;
	readonly content: string;
}

export function renderInstruction(inst: Instruction): string {
	return element("agent-instruction", attr("path", inst.path)).wrapText(inst.content).toString();
}

/**
 * Discover instruction files from the directory chains of the given file paths.
 * Walks from repo root down to each file's parent directory, checks for CLAUDE.md/AGENTS.md
 * at each level via PathIndex, reads content for files that exist, and deduplicates.
 *
 * Files in `excludePaths` are skipped — use this for changed instruction files that are
 * already primed as diffs.
 */
export async function resolveInstructions(
	rfs: RepoFs,
	filePaths: readonly string[],
	excludePaths?: ReadonlySet<string>,
): Promise<Instruction[]> {
	const candidates = buildCandidates(filePaths);
	const instructions: Instruction[] = [];

	for (const candidate of candidates) {
		if (excludePaths?.has(candidate)) continue;
		if (!rfs.fileExists(candidate)) continue;

		try {
			const buf = await rfs.readFile(candidate);
			const content = buf.toString("utf-8").trim();
			if (content) {
				instructions.push({ path: candidate, content });
			}
		} catch {
			// Skip unreadable files
		}
	}

	return instructions;
}

function buildCandidates(filePaths: readonly string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const fp of filePaths) {
		for (const dir of directoryChain(fp)) {
			for (const name of INSTRUCTION_FILENAMES) {
				const candidate = dir === "." ? name : `${dir}/${name}`;
				if (seen.has(candidate)) continue;
				seen.add(candidate);
				result.push(candidate);
			}
		}
	}

	return result;
}

function directoryChain(filePath: string): string[] {
	const clean = path.posix.normalize(filePath);
	const dir = path.posix.dirname(clean);

	if (dir === ".") return ["."];

	const parts = dir.split("/");
	const chain: string[] = ["."];

	for (let i = 0; i < parts.length; i++) {
		chain.push(parts.slice(0, i + 1).join("/"));
	}

	return chain;
}
