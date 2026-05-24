import { z } from "zod";

import { ok, err } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	path: z.string().optional().describe("Directory path relative to root. Defaults to root."),
	max_depth: z.number().int().positive().optional().describe("Recursion depth. Defaults to 1."),
	max_entries: z.number().int().positive().optional().describe("Maximum entries. Defaults to 1000."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: ToolContext, args: Input) {
	const dirPath = args.path ?? ".";
	const maxDepth = args.max_depth ?? 1;
	const maxEntries = args.max_entries ?? 1000;

	const dir = ctx.rfs().index.dir(dirPath);
	if (!dir) return err(`Directory not found: ${dirPath}`);

	const entries: string[] = [];
	collect(dir.children, "", maxDepth, 1, maxEntries, entries);

	return ok(entries.join("\n"));
}

function collect(
	children: import("../../repofs/pathindex/pathindex.ts").IndexEntry[],
	prefix: string,
	maxDepth: number,
	currentDepth: number,
	maxEntries: number,
	out: string[],
): void {
	for (const child of children) {
		if (out.length >= maxEntries) return;

		const path = prefix ? `${prefix}/${child.name}` : child.name;

		if (child.type === "dir") {
			out.push(`${path}/`);
			if (currentDepth < maxDepth) {
				collect(child.children, path, maxDepth, currentDepth + 1, maxEntries, out);
			}
		} else {
			out.push(path);
		}
	}
}

export function listDirTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "list_dir",
		register(server) {
			return server.registerTool(
				"list_dir",
				{
					description: "List directory entries from the repository index.",
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
