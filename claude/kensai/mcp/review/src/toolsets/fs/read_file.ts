import path from "node:path";

import { z } from "zod";

import type { RepoFs } from "../../repofs/repofs.ts";
import { err, errFrom, formatSuggestions, ok, suggestPaths } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const DEFAULT_LINE_LIMIT = 2000;
const LINE_LENGTH_CAP = 1024;
const BINARY_PROBE_SIZE = 512;
const CAT_N_WIDTH = 6;

const BINARY_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".bmp",
	".ico",
	".tiff",
	".tif",
	".heic",
	".heif",
	".pdf",
	".zip",
	".tar",
	".gz",
	".bz2",
	".xz",
	".7z",
	".rar",
	".jar",
	".war",
	".class",
	".wasm",
	".o",
	".a",
	".so",
	".dylib",
	".dll",
	".exe",
	".bin",
	".dat",
	".woff",
	".woff2",
	".ttf",
	".eot",
	".otf",
	".mp3",
	".mp4",
	".mov",
	".avi",
	".webm",
	".sqlite",
	".db",
]);

const inputSchema = z.object({
	file_path: z.string().describe("File path relative to repository root."),
	line_offset: z
		.number()
		.int()
		.positive()
		.nullable()
		.optional()
		.describe("Start line (1-based). Null reads from the beginning."),
	line_limit: z
		.number()
		.int()
		.positive()
		.nullable()
		.optional()
		.describe(`Max lines to return. Null defaults to ${DEFAULT_LINE_LIMIT}.`),
});

type Input = z.infer<typeof inputSchema>;

async function handle(ctx: ToolContext, args: Input) {
	if (!args.file_path) return err("file_path is required");

	const ext = path.extname(args.file_path).toLowerCase();
	if (BINARY_EXTENSIONS.has(ext)) {
		return ok(`[${args.file_path}: binary file extension, cannot be displayed as text]`);
	}

	const rfs = ctx.rfs();

	if (rfs.dirExists(args.file_path)) {
		return ok(`[${args.file_path}: is a directory, not a file (use list_dir instead)]`);
	}

	let buf: Buffer;
	try {
		buf = await rfs.readFile(args.file_path);
	} catch (error) {
		if (error instanceof Error && error.message.includes("not found")) {
			return notFoundResult(rfs, args.file_path);
		}
		return errFrom(error);
	}

	if (hasBinaryContent(buf)) {
		return ok(
			`[${args.file_path}: binary content (null byte in first ${BINARY_PROBE_SIZE} bytes), cannot be displayed as text]`,
		);
	}

	const text = buf.toString("utf-8");
	const lines = text.split("\n");

	const startIdx = args.line_offset ? args.line_offset - 1 : 0;
	const limit = args.line_limit ?? DEFAULT_LINE_LIMIT;
	const endIdx = startIdx + limit;

	if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
		return ok("[file exists, but is empty]");
	}

	if (startIdx >= lines.length) {
		return ok("[line_offset is past end of file]");
	}

	const sliced = lines.slice(startIdx, endIdx);
	const body = sliced.map((line, i) => formatLine(line, startIdx + i + 1)).join("\n") + "\n";

	return ok(body);
}

function formatLine(content: string, lnum: number): string {
	if (content.endsWith("\r")) content = content.slice(0, -1);

	const fullLen = content.length;
	if (fullLen > LINE_LENGTH_CAP) {
		content = content.slice(0, LINE_LENGTH_CAP) + ` [+${fullLen - LINE_LENGTH_CAP} bytes truncated]`;
	}

	const num = String(lnum);
	const pad = CAT_N_WIDTH - num.length;

	return (pad > 0 ? " ".repeat(pad) : "") + num + "\t" + content;
}

function hasBinaryContent(buf: Buffer): boolean {
	const probe = Math.min(buf.length, BINARY_PROBE_SIZE);
	for (let i = 0; i < probe; i++) {
		if (buf[i] === 0) return true;
	}
	return false;
}

function notFoundResult(rfs: RepoFs, filePath: string) {
	return ok(`[file not found: ${filePath}]${formatSuggestions(suggestPaths(rfs, filePath))}`);
}

export function readFileTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "read_file",
		register(server) {
			return server.registerTool(
				"read_file",
				{
					description: `Read a text file with line numbers. Use search tools to discover paths, list_dir for directories. Default ${DEFAULT_LINE_LIMIT} lines.`,
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
