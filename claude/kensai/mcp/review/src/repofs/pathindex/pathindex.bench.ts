import { bench, describe } from "vite-plus/test";

import { PathIndex } from "./pathindex.ts";

const benchmarkRepo = process.env["KENSAI_BENCHMARK_REPO"]!;

describe("construction", () => {
	bench(
		"build",
		async () => {
			await PathIndex.new(benchmarkRepo);
		},
		{ throws: true, iterations: 5, time: 0 },
	);
});

describe("globSearch", async () => {
	const ix = await PathIndex.new(benchmarkRepo);
	console.log(`indexed ${ix.length} files`);

	bench(
		"includes",
		() => {
			ix.globSearch({ includes: ["prog/**"], maxResults: 20 });
		},
		{ throws: true },
	);

	bench(
		"excludes",
		() => {
			ix.globSearch({ excludes: [".git/**", "node_modules/**"], maxResults: 20 });
		},
		{ throws: true },
	);

	bench(
		"includes + excludes",
		() => {
			ix.globSearch({ includes: ["prog/**"], excludes: [".git/**"], maxResults: 20 });
		},
		{ throws: true },
	);
});

describe("fuzzySearch", async () => {
	const ix = await PathIndex.new(benchmarkRepo);

	bench(
		"single word",
		() => {
			ix.fuzzySearch("shaderMesh", { maxResults: 20 });
		},
		{ throws: true },
	);

	bench(
		"with includes",
		() => {
			ix.fuzzySearch("config", { includes: ["prog/**"], maxResults: 20 });
		},
		{ throws: true },
	);

	bench(
		"with excludes",
		() => {
			ix.fuzzySearch("shaderMesh", { excludes: [".git/**"], maxResults: 20 });
		},
		{ throws: true },
	);
});

describe("tree", async () => {
	const ix = await PathIndex.new(benchmarkRepo);

	bench(
		"dir root",
		() => {
			ix.dir(".");
		},
		{ throws: true },
	);
});
