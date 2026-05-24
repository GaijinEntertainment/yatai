---
name: review
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

**Read-only** — do not edit, write, or modify files. Reviewing, not fixing.

The kensai MCP server holds all session state. Agents self-serve context via `mcp__kensai__session_priming` — no data
threading from lead to agents.

## Environment

Agent teams: !`echo ${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-disabled}`

## Prerequisites

1. If agent teams shows `disabled` above, stop and tell the user:
   > Agent teams required. Add to settings:
   > ```json
   > { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
   > ```
   > Then restart.

2. Call `mcp__kensai__session_start` with resolved mode and path. On error, inform the user and stop.

**Mode:** `$mode` (default: `uncommitted`) **Path:** `$path` (default: current directory)

If mode looks like a path, treat as `$path` with mode `uncommitted`.

- **`committed`** — HEAD~1..HEAD. Review the topmost commit.
- **`uncommitted`** (default) — HEAD..working tree. Review work-in-progress.
- **`all`** — HEAD~1..working tree. Review commit + uncommitted (amendment scenario).

## Pipeline

### Phase 1: Grounding

1. Create a team. Spawn a `review-grounder` teammate. No data in spawn prompt — grounder calls
   `mcp__kensai__session_priming` to get metadata, changed files, file stats, and all diffs.
2. Wait for grounder to complete. Grounder stores structured context via MCP and calls `mcp__kensai__grounding_complete`.
3. **Shut down the grounder.**

### Phase 2: Surfacing

1. Read grounding from `mcp__kensai__grounding_get` — summary, integration surface, hotspots, blind spots, intent.
2. Derive **surfacing dimensions** from the grounding — as many as the change warrants. Each dimension is a **review
   discipline** — a type of review, not an investigation question. Each surfacer performs a different kind of review:
   design, integration, correctness, completeness, etc.

   Examples of review disciplines (non-exhaustive — derive from the change's nature):
   - "Design review" — architecture, patterns, abstractions, separation of concerns
   - "Integration review" — API contracts, caller migration, cross-boundary compatibility
   - "Correctness review" — data fidelity, type safety, invariant preservation
   - "Completeness review" — coverage of all affected sites, missing updates, dead code

   **Bad dimensions** are focused investigation questions that pre-bias the surfacer:
   - "tri_ref_t round-trip through damage model stash/reconstruct path" — names the exact code path
   - "iterateNodeFaces uint16_t->uint32_t widening -- consumer completeness" — tells what to find

   The test: does this dimension name a type of review, or does it name what the surfacer should find?

3. Create a task per dimension. Spawn `review-surfacer` teammates in parallel — one per dimension. Spawn prompt includes
   the discipline name and **quality criteria** — broad focus points derived from grounding. Not a methodology — a short
   list of patterns to watch for, categories of risk relevant to the change's nature.

   Quality criteria are broad: "watch for implicit narrowing at type boundaries", "check that renamed APIs propagate to
   all consumer sites." NOT specific: "check how X packs into bits 48-63", "verify file.cpp:555 applies the right
   transform."

4. **Always spawn one additional general-review surfacer** alongside the dimension surfacers. No prescribed dimension or
   quality criteria. Spawn prompt: "General review -- no prescribed dimension. Follow any thread. Focus on behavioral
   regressions: semantic contracts, coordinate spaces, filtering semantics, lifecycle guarantees, concurrency."

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
