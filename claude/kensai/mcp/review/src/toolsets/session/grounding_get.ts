import { element, attr } from "../../llmxml/llmxml.ts";
import type { GroundingNote, GroundingResult, Observation } from "../../session/grounding-storage.ts";
import { ok } from "../result.ts";
import type { ToolContext, ToolRegistrar } from "../types.ts";

function handle(ctx: ToolContext) {
	const storage = ctx.grounding();
	const result = storage.result();
	const observations = storage.observations();

	if (!result && observations.length === 0) return ok("[no grounding stored yet]");

	const parts: string[] = [];

	if (result) {
		parts.push(renderGroundingResult(result));
	}

	if (observations.length > 0) {
		const rendered = observations.map(renderObservation).join("\n");
		parts.push(element("observations", attr("count", observations.length)).wrapText(rendered).toString());
	}

	return ok(parts.join("\n\n"));
}

function renderGroundingResult(r: GroundingResult): string {
	const sections = [
		element("summary").wrapText(r.summary).toString(),
		element("integration_surface").wrapText(r.integrationSurface).toString(),
		element("intent").wrapText(r.intent).toString(),
	];

	if (r.hotspots?.length) {
		const items = r.hotspots.map(renderNote).join("\n");
		sections.push(element("hotspots").wrapText(items).toString());
	}

	if (r.blindspots?.length) {
		const items = r.blindspots.map(renderNote).join("\n");
		sections.push(element("blindspots").wrapText(items).toString());
	}

	return element("grounding").wrapText(sections.join("\n")).toString();
}

function renderNote(n: GroundingNote): string {
	return element("note", attr("location", n.location)).inlineText(n.description).toString();
}

function renderObservation(o: Observation): string {
	const attrs = [attr("id", o.id)];
	if (o.location) attrs.push(attr("location", o.location));
	if (o.category) attrs.push(attr("category", o.category));
	if (o.cancelled) attrs.push(attr("cancelled", true));

	const parts = [element("summary").inlineText(o.summary).toString()];
	if (o.detail) parts.push(element("detail").inlineText(o.detail).toString());
	if (o.cancelled && o.cancelReason) parts.push(element("cancel_reason").inlineText(o.cancelReason).toString());

	return element("observation", ...attrs)
		.wrapText(parts.join("\n"))
		.toString();
}

export function groundingGetTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "grounding_get",
		register(server) {
			return server.registerTool(
				"grounding_get",
				{
					description: [
						"Retrieve the stored grounding context. Available from SURFACING onward.",
						"",
						"Behaviour:",
						"  - Returns LLMXML with <grounding> (summary, integration_surface, intent, hotspots, blindspots)",
						"    and <observations> (all recorded observations with status).",
						"  - Returns [no grounding stored yet] when called before grounding_store.",
						"  - Use to recall the grounder's model of the change during surfacing and proving.",
					].join("\n"),
					annotations: { readOnlyHint: true },
				},
				() => handle(ctx),
			);
		},
	};
}
