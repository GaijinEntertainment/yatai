import { z } from "zod";

import { errFrom, ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	path: z.string().describe("File path relative to the repository root."),
	line_offset: z.number().int().positive().optional().describe("Start line (1-based). Defaults to 1."),
	line_limit: z.number().int().positive().optional().describe("Maximum lines to return. Defaults to 2000."),
});

type Input = z.infer<typeof inputSchema>;

async function handle(ctx: ToolContext, args: Input) {
	const rfs = ctx.rfs();
	const offset = args.line_offset ?? 1;
	const limit = args.line_limit ?? 2000;

	let buf: Buffer;
	try {
		buf = await rfs.readFile(args.path);
	} catch (error) {
		return errFrom(error);
	}

	const text = buf.toString("utf-8");
	const lines = text.split("\n");

	const start = offset - 1;
	const sliced = lines.slice(start, start + limit);

	return ok(sliced.map((line, i) => `${offset + i}\t${line}`).join("\n"));
}

export function readFileTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "read_file",
		register(server) {
			return server.registerTool(
				"read_file",
				{
					description: "Read a file from the repository with line numbers.",
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
