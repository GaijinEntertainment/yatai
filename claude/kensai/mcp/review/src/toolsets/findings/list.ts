import { z } from "zod";

import { element, attr } from "../../llmxml/llmxml.ts";
import type { Finding } from "../../session/findings-storage.ts";
import { ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

const inputSchema = z.object({
	dimension: z.string().optional().describe("Filter by review dimension."),
	status: z.enum(["pending", "confirmed", "rejected", "cancelled"]).optional().describe("Filter by status."),
});

type Input = z.infer<typeof inputSchema>;

function handle(ctx: ToolContext, args: Input) {
	const results = ctx.findings().list({ dimension: args.dimension, status: args.status });

	if (results.length === 0) return ok("[no findings]");

	const rendered = results.map(renderFinding).join("\n");
	return ok(element("findings", attr("count", results.length)).wrapText(rendered).toString());
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

export function findingsListTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "findings_list",
		register(server) {
			return server.registerTool(
				"findings_list",
				{
					description: "List all findings in the current review, with optional filtering.",
					inputSchema,
					annotations: { readOnlyHint: true },
				},
				(args) => handle(ctx, args),
			);
		},
	};
}
