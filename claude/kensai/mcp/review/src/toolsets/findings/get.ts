import { z } from "zod";

import { element, attr } from "../../llmxml/llmxml.ts";
import type { Finding } from "../../session/findings-storage.ts";
import { ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	finding_id: z.string().describe("Finding ID (e.g. F1)."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: ToolContext, args: Input) {
	const f = ctx.findings().get(args.finding_id);
	if (!f) return ok(`[finding not found: ${args.finding_id}]`);
	return ok(renderFinding(f));
}

function renderFinding(f: Finding): string {
	const loc = element("location").inlineText(f.location).toString();
	const concern = element("concern").inlineText(f.concern).toString();

	const parts = [loc, concern];

	if (f.evidence) {
		parts.push(element("evidence").inlineText(f.evidence).toString());
	}

	if (f.verdict) {
		const v = element("verdict", attr("result", f.verdict.result)).inlineText(f.verdict.reason).toString();
		parts.push(v);
	}

	return element(
		"finding",
		attr("id", f.id),
		attr("kind", f.severity),
		attr("status", f.status),
		attr("dimension", f.dimension),
	)
		.wrapText(parts.join("\n"))
		.toString();
}

export function findingGetTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "finding_get",
		register(server) {
			return server.registerTool(
				"finding_get",
				{
					description: [
						"Get a single finding by its ID. Returns full detail including verdict if proven.",
						"",
						"Behaviour:",
						"  - Returns LLMXML <finding> element with id, kind, status, dimension attributes.",
						"  - Nested elements: <location>, <concern>, <evidence>, and <verdict> (if proven).",
						'  - Not found -> "[finding not found: F99]" soft error.',
						"  - Use to inspect a specific finding's full evidence and verdict chain.",
					].join("\n"),
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
