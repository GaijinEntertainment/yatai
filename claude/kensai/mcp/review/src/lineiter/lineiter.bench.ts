import { createReadStream } from "node:fs";
import path from "node:path/posix";

import { bench, describe } from "vite-plus/test";

import type { IndexEntryDir } from "../pathindex/pathindex.ts";
import { PathIndex } from "../pathindex/pathindex.ts";
import { ErrBinaryContent, LineIter } from "./lineiter.ts";

const benchmarkRepo = process.env["KENSAI_BENCHMARK_REPO"]!;

interface RepoStats {
	files: number;
	binary: number;
	lines: number;
	bytes: number;
	maxLineLen: number;
	maxLineLenFile: string;
}

function emptyStats(): RepoStats {
	return { files: 0, binary: 0, lines: 0, bytes: 0, maxLineLen: 0, maxLineLenFile: "" };
}

function mergeStats(target: RepoStats, source: RepoStats): void {
	target.files += source.files;
	target.binary += source.binary;
	target.lines += source.lines;
	target.bytes += source.bytes;
	if (source.maxLineLen > target.maxLineLen) {
		target.maxLineLen = source.maxLineLen;
		target.maxLineLenFile = source.maxLineLenFile;
	}
}

async function scanFile(absRoot: string, relPath: string, lineCap: number): Promise<RepoStats> {
	const stats = emptyStats();
	const stream = createReadStream(path.join(absRoot, relPath));

	try {
		const iter = await LineIter.new(stream, { lineCap });
		stats.files = 1;
		while (await iter.next()) {
			stats.lines++;
			stats.bytes += iter.len();
			if (iter.len() > stats.maxLineLen) {
				stats.maxLineLen = iter.len();
				stats.maxLineLenFile = relPath;
			}
		}
	} catch (e) {
		if (e instanceof ErrBinaryContent) {
			stats.binary = 1;
		} else if ((e as NodeJS.ErrnoException).code === "EISDIR" || (e as NodeJS.ErrnoException).code === "ENOENT") {
			// skip
		} else {
			throw e;
		}
	} finally {
		stream.destroy();
	}

	return stats;
}

async function scanDir(absRoot: string, dir: IndexEntryDir, dirPath: string, lineCap: number): Promise<RepoStats> {
	const subdirs: Promise<RepoStats>[] = [];
	const files: string[] = [];

	for (const child of dir.children) {
		const childPath = dirPath ? path.join(dirPath, child.name) : child.name;
		if (child.type === "dir") {
			subdirs.push(scanDir(absRoot, child, childPath, lineCap));
		} else if (child.type === "file") {
			files.push(childPath);
		}
	}

	const stats = emptyStats();
	const batchSize = 128;
	for (let i = 0; i < files.length; i += batchSize) {
		const batch = files.slice(i, i + batchSize);
		const results = await Promise.all(batch.map((f) => scanFile(absRoot, f, lineCap)));
		for (const r of results) mergeStats(stats, r);
	}

	const dirResults = await Promise.all(subdirs);
	for (const r of dirResults) mergeStats(stats, r);
	return stats;
}

async function collectStats(ix: PathIndex, lineCap: number): Promise<RepoStats> {
	return scanDir(ix.absRoot, ix.root, "", lineCap);
}

describe("repo scan", async () => {
	const ix = await PathIndex.new(benchmarkRepo);
	console.log(`indexed ${ix.length} files`);

	const stats = await collectStats(ix, 0);
	console.log(
		`${stats.files} text files, ${stats.binary} binary, ${stats.lines} lines, ` +
			`${(stats.bytes / 1024 / 1024).toFixed(1)} MiB, max line ${stats.maxLineLen}b in ${stats.maxLineLenFile}`,
	);

	bench(
		"scan all (body-less)",
		async () => {
			await collectStats(ix, 0);
		},
		{ throws: true, iterations: 3, time: 0 },
	);
});
