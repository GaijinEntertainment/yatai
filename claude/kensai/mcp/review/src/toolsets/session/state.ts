import { element, attr } from "../../llmxml/llmxml.ts";
import { resolveRefs } from "../../session/session.ts";
import { ok, err } from "../result.ts";
import type { Session, ToolRegistrar } from "../types.ts";

export interface StateContext {
	getSession(): Session | null;
}

function handle(ctx: StateContext) {
	const s = ctx.getSession();
	if (!s) return err("[no active session]");

	const { base, head } = resolveRefs(s.mode);
	const headLabel = head ?? "working tree";

	const fileCounts = { added: 0, modified: 0, deleted: 0 };
	for (const f of s.changedFiles) {
		if (f.status === "added") fileCounts.added++;
		else if (f.status === "deleted") fileCounts.deleted++;
		else fileCounts.modified++;
	}

	const parts = [
		element("refs", attr("base", base), attr("head", headLabel)).toString(),
		element(
			"changed_files",
			attr("total", s.changedFiles.length),
			attr("added", fileCounts.added),
			attr("modified", fileCounts.modified),
			attr("deleted", fileCounts.deleted),
		).toString(),
		element("findings", attr("count", s.findings.count())).toString(),
	];

	const body = element(
		"session",
		attr("id", s.id),
		attr("root", s.root),
		attr("mode", s.mode),
		attr("phase", s.phase),
		attr("started", s.startedAt.toISOString()),
	)
		.wrapText(parts.join("\n"))
		.toString();

	return ok(body);
}

export function sessionStateTool(ctx: StateContext): ToolRegistrar {
	return {
		name: "session_state",
		register(server) {
			return server.registerTool(
				"session_state",
				{ description: "Returns the current session state.", annotations: { readOnlyHint: true } },
				() => handle(ctx),
			);
		},
	};
}
