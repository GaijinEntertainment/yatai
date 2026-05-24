# Kensai Review MCP Server

Stateful stdio MCP server for the kensai code review pipeline. Single active session per server instance — all tools are
bound to the session's project root. Tool names use `snake_case`.

Response format: LLMXML (pseudo-XML optimized for LLM consumption) — see `src/llmxml/`.

## Architecture

**Toolsets as providers.** Each toolset defines its own tools internally and exposes them via a `tools()` method
returning `ToolRegistrar[]`. Toolsets are domain-scoped: session, fs, git, findings.

**SessionToolset as binder.** A single `bind(server)` call registers all tools — session tools (always enabled) and
dependant toolset tools (start disabled). No separate registry class; SessionToolset IS the registry.

**Dynamic tool visibility.** Dependant tools are hidden from MCP tool listing via `RegisteredTool.disable()` until a
session is active. The SDK auto-sends `tools/list_changed` notifications on enable/disable.

**Declarative state sync.** On session lifecycle events, `#enabledTools()` computes the full desired set of enabled tool
names, and `#sync()` converges — enables what should be on, disables what should be off. No incremental tracking.

**Lazy dependency injection.** `ToolContext` provides lazy accessors (`rfs()`, `findings()`, `grounding()`) that resolve
against the current session at call time. Toolsets are stateless — all state lives in `Session`.

**`session_start` is fat.** Takes root + mode, creates `Session` via `Session.start()` — validates git, builds
PathIndex, collects diffs and metadata in parallel.

**Phase state machine.** `Session.phase` tracks pipeline progress (`GROUNDING → SURFACING → PROVING → FILING →
COMPLETE`). Phase transition tools validate preconditions and call `session.advance(to)`.

## Structure

```
src/
├── index.ts                  — server creation, toolset wiring, transport
├── llmxml/                   — pseudo-XML markup builder for LLM responses
│   └── CLAUDE.md
├── repofs/                   — scoped filesystem facade composing all sub-modules
│   ├── CLAUDE.md
│   ├── git/                  — thin git CLI abstraction with diff annotation
│   ├── rg/                   — ripgrep CLI abstraction for content search
│   ├── pathindex/            — tree-structured file index with fuzzy/glob search
│   └── lineiter/             — streaming line iterator with pluggable binary detection
└── toolsets/                 — one folder per toolset, one file per tool
    ├── types.ts              — ToolRegistrar, ToolContext, SessionDependant
    ├── result.ts             — ok(), err(), errFrom() response helpers
    ├── session/              — session lifecycle + phase transitions (11 tools)
    │   ├── toolset.ts        — SessionToolset (binder, sync, lifecycle)
    │   ├── start.ts          — session_start
    │   ├── state.ts          — session_state
    │   ├── end.ts            — session_end
    │   ├── observation_*.ts  — create, cancel
    │   ├── grounding_*.ts    — store, get, complete
    │   ├── surfacing_*.ts    — complete
    │   ├── proving_*.ts      — complete
    │   └── filing_*.ts       — complete
    ├── fs/                   — filesystem + search tools (4 tools)
    │   ├── toolset.ts        — FsToolset
    │   ├── read_file.ts, find_files.ts, list_dir.ts, grep.ts
    ├── git/                  — git tools (3 tools)
    │   ├── toolset.ts        — GitToolset
    │   ├── diff_file.ts, changed_files.ts, log.ts
    └── findings/             — findings lifecycle tools (6 tools)
        ├── toolset.ts        — FindingsToolset
        ├── surface.ts, surface_clean.ts, cancel.ts
        ├── verdict.ts, list.ts, get.ts
```

## Implementation Plan

### Phase 0: Infrastructure (pure library, no MCP)

- [x] **llmxml** — pseudo-XML markup builder. See `src/llmxml/CLAUDE.md`.
- [x] **pathindex** — tree-structured file index. See `src/repofs/pathindex/CLAUDE.md`.
- [x] **lineiter** — streaming line iterator. See `src/repofs/lineiter/CLAUDE.md`.
- [x] **git** — thin git CLI abstraction. See `src/repofs/git/CLAUDE.md`.
- [x] **rg** — ripgrep CLI abstraction. See `src/repofs/rg/CLAUDE.md`.
- [x] **repofs** — scoped filesystem facade. See `src/repofs/CLAUDE.md`.

### Phase 1: Toolset infrastructure + tool stubs

- [x] **toolset architecture** — toolsets as providers, SessionToolset as binder, dynamic
      tool visibility via enable/disable, declarative state sync
- [x] **tool stubs** — 22 tools across 4 toolsets (session, fs, git, findings), all with
      stub handlers returning placeholder text

### Phase 2: Tool implementation

Session:

- [x] **session_start** — fat init: RepoFs.open, git context, deterministic data gathering
- [x] **session_state** — current phase, session info, finding count
- [x] **session_end** — clear dependants, destroy session

Filesystem:

- [ ] **read_file** — read file with line numbers, binary detection, line cap
- [ ] **list_dir** — directory listing via pathindex tree
- [ ] **find_files** — file search via pathindex fuzzySearch/globSearch
- [ ] **grep** — content search via ripgrep

Git:

- [ ] **diff_file** — annotated diff for a single file
- [ ] **changed_files** — name-status list for review mode
- [ ] **log** — commit history

Findings:

- [x] **finding_surface** — record a finding during surfacing
- [x] **surface_clean** — report a clean dimension
- [x] **finding_cancel** — retract a finding
- [x] **finding_verdict** — verdict a finding (confirmed/rejected)
- [x] **findings_list** — list findings with filter
- [x] **finding_get** — get a single finding

Phase transitions:

- [x] **grounding_store** / **grounding_get** — persist and retrieve grounding context
- [x] **observation_create** / **observation_cancel** — incremental observations during grounding
- [x] **grounding_complete** — GROUNDING -> SURFACING
- [x] **surfacing_complete** — SURFACING -> PROVING (or FILING if 0 findings)
- [x] **proving_complete** — PROVING -> FILING
- [x] **filing_complete** — FILING -> COMPLETE

### Phase 3: Phase-gated tool visibility

- [ ] Extend `#enabledTools()` to account for current phase — enable/disable tools per phase

## Review Modes

| Mode          | Compares             | Use case                     |
| ------------- | -------------------- | ---------------------------- |
| `committed`   | HEAD~1..HEAD         | Review the topmost commit    |
| `uncommitted` | HEAD..working tree   | Review uncommitted changes   |
| `all`         | HEAD~1..working tree | Topmost commit + uncommitted |

## Pipeline

Four phases, strictly ordered. Completion of each phase starts the next.

```
IDLE -> GROUNDING -> SURFACING -> PROVING -> FILING -> COMPLETE
                                    \- (0 findings) -/
```

## Conventions

- Each toolset lives in its own folder under `toolsets/`, each tool in a dedicated file
- Tool names use `snake_case`
- Tool files follow a three-part pattern: module-level `inputSchema` (z.object), standalone `handle()` function,
  thin factory exporting `ToolRegistrar` — see `src/toolsets/CLAUDE.md` for the full template
- All tool responses use `ok()`/`err()`/`errFrom()` from `result.ts` — never construct `CallToolResult` directly
- Domain errors are caught in `handle()` and returned via `errFrom()`, not thrown through the SDK
- Toolsets implement `SessionDependant` for session lifecycle injection via `ToolContext`
- Infrastructure libraries (`pathindex`, `lineiter`, `llmxml`) are pure — no MCP dependency, independently testable
- Each module has its own `CLAUDE.md` documenting API and design
- Use `vp check` for formatting + linting + type-checking, `vp test` for tests, `vp test bench` for benchmarks

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite
Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+
is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands
and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via
      `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking
      for help.

<!--VITE PLUS END-->
