---
name: kensai-review
description: >-
  Local multi-agent code review with adversarial falsification. Orchestrated by the kensai MCP
  server — call `start`, follow returned instructions through grounding → surfacing → proving →
  filing. Supports committed, uncommitted, or all changes. Optionally pass a path.
disable-model-invocation: true
argument-hint: "[uncommitted|committed|all] [project-path]"
arguments: [mode, path]
effort: max
---

# Code Review

**Read-only** — do not edit, write, or modify files.

The kensai MCP server holds all session state. Agents self-serve context via `mcp__kensai__session_priming` — no data
threading from lead to agents.

## Environment

Agent teams: !`printenv CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`

## Prerequisites

1. If `printenv` above is blank or `TeamCreate` tool is not available, stop and tell the user:

   > Agent teams required. Add to settings:
   >
   > ```json
   > { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
   > ```
   >
   > Then restart.

2. Call `mcp__kensai__session_start` with resolved mode and path. On error, inform the user and stop.

**Mode:** `$mode` (default: `uncommitted`) **Path:** `$path` (default: current directory)

If mode looks like a path, treat as `$path` with mode `uncommitted`.

- **`committed`** — HEAD~1..HEAD. Review the topmost commit.
- **`uncommitted`** (default) — HEAD..working tree. Review work-in-progress.
- **`all`** — HEAD~1..working tree. Review commit + uncommitted (amendment scenario).

## Model Selection

After `session_start`, check `session_state` for `changed_files` total. 20+ files → spawn teammates with
`model: "<current-model>[1m]"`. Otherwise default model.

## Pipeline

### Phase 1: Grounding

1. Create a team. Spawn a `review-grounder` teammate. No data in spawn prompt — grounder self-serves via
   `session_priming`.
2. Wait for grounder to complete. Grounder stores structured context via MCP and calls `mcp__kensai__grounding_complete`.
3. **Shut down the grounder.**

### Phase 2: Surfacing

1. Read grounding from `mcp__kensai__grounding_get` — summary, integration surface, hotspots, blind spots, intent.
2. Derive **surfacing dimensions** from grounding — each dimension names a **specific risk area this change introduces**,
   not a generic review category. The dimension tells the surfacer WHERE to focus; the surfacer decides WHAT to find.

   Derivation process:
   - Read grounding hotspots. Each hotspot is a candidate dimension or feeds into one.
   - Read the integration surface. Cross-boundary touchpoints suggest dimensions.
   - Name the dimension after the RISK, not after a review discipline.

   <examples>
   <example>
   <type>Good dimensions (derived from specific change)</type>
   <good>
   For a change that replaces FRT with BVH and widens uint16 to uint32:
   - "uint16-to-uint32 widening across 30+ consumer call sites"
   - "BVH trace semantic parity with FRT canonical implementation"
   - "legacy binary format parse-and-discard correctness"
   </good>
   </example>

   <example>
   <type>Good dimensions (derived from a pagination + doc change)</type>
   <good>
   - "pagination boundary correctness — block splitting, oversized blocks, page footer"
   - "documentation accuracy after behavioral changes — tool visibility, naming, counts"
   </good>
   </example>

   <example>
   <type>Bad dimensions (generic review categories)</type>
   <bad>
   - "Correctness review" — every review checks correctness; this doesn't focus the surfacer
   - "Integration review" — too broad; says nothing about what integration risks THIS change has
   - "Completeness review" — generic; the surfacer doesn't know what completeness means for this change
   - "Design review" — applicable to any change; doesn't leverage grounding
   </bad>
   </example>

   <example>
   <type>Bad dimensions (investigation questions)</type>
   <bad>
   - "tri_ref_t round-trip through damage model" — names the exact code path to check
   - "iterateNodeFaces uint16_t widening — consumer completeness" — tells what to find
   </bad>
   </example>
   </examples>

   **Self-check before spawning:** if you could copy the same dimension name to a different change and it would still
   make sense, the dimension is too generic. Rewrite it using terms from the grounding.

3. Create a task per dimension. Spawn `review-surfacer` teammates in parallel — one per dimension. Spawn prompt:
   dimension name + quality criteria from grounding hotspots (risk patterns to watch for, not methodology).

4. **Always spawn one additional general-review surfacer** alongside the dimension surfacers. No prescribed dimension or
   quality criteria. Spawn prompt: "General review -- no prescribed dimension. Follow any thread. Focus on behavioral
   regressions: semantic contracts, lifecycle guarantees, concurrency, and anything the dimension surfacers might miss."

5. Wait for all surfacers. They record findings and call `mcp__kensai__surface_clean` or
   `mcp__kensai__finding_surface` via MCP.
6. **Shut down all surfacers.**

### Phase 3: Proving

1. Call `mcp__kensai__surfacing_complete`. If 0 findings -> skips to filing.
2. Spawn a `review-prover` teammate. Prover self-serves findings and context via MCP, applies falsification gates,
   verdicts each finding.
3. Wait for prover to complete.
4. **Check for unverdicted findings** — call `mcp__kensai__findings_list` with `status: "pending"`. If any remain,
   message the prover with the pending finding IDs and wait. Repeat until all are handled.
5. **Shut down the prover.**

### Phase 4: Filing

1. Read confirmed findings from `mcp__kensai__findings_list` with `status: "confirmed"`.
2. Apply last-gate filter: already handled? Intentional? Not actionable? Speculative? Boundary crossing? Drop if any.
3. Write the terminal report. One issue per finding. Assertions, not questions. Quote code, cite `file:line`.
4. Call `mcp__kensai__filing_complete`.
5. Call `mcp__kensai__session_end`.
6. **Clean up the team.**

The MCP enforces phase order. Tools reject calls outside their valid phase.
