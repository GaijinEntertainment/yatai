# Kensai

Multi-agent code review pipeline with adversarial falsification. A stateful MCP server orchestrates four phases —
grounding, surfacing, proving, filing — with dedicated agents per phase.

## Pipeline

```
/review [mode] [path]
  → mcp__kensai__session_start            IDLE → GROUNDING
  → mcp__kensai__grounding_store
  → mcp__kensai__grounding_complete       GROUNDING → SURFACING
  → mcp__kensai__finding_surface / surface_clean
  → mcp__kensai__surfacing_complete       SURFACING → PROVING (or FILING if 0 findings)
  → mcp__kensai__finding_verdict
  → mcp__kensai__proving_complete         PROVING → FILING
  → mcp__kensai__filing_complete          FILING → COMPLETE
```

## Components

| Component | Purpose |
|-----------|---------|
| `mcp/review/src/index.ts` | MCP server — phase state machine, context persistence, phase-gated tools |
| `skills/review/SKILL.md` | `/review` entry point — mode/path resolution, pipeline orchestration |
| `agents/review-grounder.md` | Grounding agent — maps the change, builds three-layer model, stores context via MCP |
| `agents/review-surfacer.md` | Surfacing agent — parallel read-only reviewer per dimension, records findings via MCP |
| `agents/review-prover.md` | Proving agent — adversarial falsification of surfaced findings, verdicts via MCP |

## MCP Tools

### Session lifecycle

| Tool | Purpose |
|------|---------|
| `session_start` | Initialize session (IDLE -> GROUNDING) |
| `session_state` | Current phase, mode, refs, file/finding counts |
| `session_priming` | Full context: metadata, changed files, file stats, all diffs (multi-block) |
| `session_end` | Destroy session |

### Filesystem and search (session-scoped)

| Tool | Purpose |
|------|---------|
| `read_file` | Read file with line numbers, binary detection |
| `list_dir` | Directory listing with depth control |
| `find_files` | Fuzzy file-name search |
| `grep` | Regex content search via ripgrep |

### Git (session-scoped)

| Tool | Purpose |
|------|---------|
| `changed_files` | File list with status (A/M/D) and +/- counts |
| `diff_file` | Annotated unified diff for one file |
| `log` | Recent commit history |

### Review pipeline

| Tool | Phase | Purpose |
|------|-------|---------|
| `observation_create` | GROUNDING | Record an observation |
| `observation_cancel` | GROUNDING | Retract an observation |
| `grounding_store` | GROUNDING | Persist grounding context |
| `grounding_get` | SURFACING+ | Retrieve grounding context |
| `grounding_complete` | GROUNDING -> SURFACING | Advance phase |
| `finding_surface` | SURFACING | Record a finding |
| `surface_clean` | SURFACING | Report a clean dimension |
| `finding_cancel` | SURFACING | Retract a finding |
| `surfacing_complete` | SURFACING -> PROVING/FILING | Advance (skip proving if 0 findings) |
| `findings_list` | PROVING+ | List findings with filter |
| `finding_get` | PROVING+ | Get single finding detail |
| `finding_verdict` | PROVING | Verdict a finding (pass/reject) |
| `proving_complete` | PROVING -> FILING | Advance phase |
| `filing_complete` | FILING -> COMPLETE | Mark review done |

## Requirements

- Agent teams: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- Node.js 26+ (MCP server)

## Design

- **MCP-first** — agents access codebase exclusively through `mcp__kensai__*` tools; no direct Read/Grep/Bash
- **Self-serve context** — agents call `session_priming` to receive full review context; no data threading from lead
- **Phase-gated visibility** — only `session_start` visible before session; all tools enabled after
- **Dedicated completion tools** — `grounding_complete`, `surfacing_complete`, `proving_complete` (not generic `transition`)
- **0-findings shortcut** — `surfacing_complete` jumps to FILING when no findings, skipping PROVING
- **Recall over precision** — surfacers cast a wide net; prover applies falsification gates to filter
- **Read-only agents** — grounder, surfacers, and prover never edit files
- **Stable finding IDs** — F1, F2, ... carried across phase boundaries
- **Soft errors** — not-found/binary/empty return `ok("[marker]")` with path suggestions, not `err()`
