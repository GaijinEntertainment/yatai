# Kensai Review MCP Server

Stateful stdio MCP server for the kensai code review pipeline. Single active session per server instance — all tools are
bound to the session's project root. Tool names are scoped by entity: `session-*`, `grounding-*`, `finding-*`, etc.

Response format: LLMXML (pseudo-XML optimized for LLM consumption) — see `src/llmxml/`.

## Architecture

`session-start` performs heavy initialization: validates git, walks the file tree to build a path index, fetches
deterministic data (commit message, diff, changed files). All subsequent tools operate within the session's project root.

Every tool has two layers:

- **Programmatic core** — pure function, callable internally (e.g., session-start calls the indexer)
- **MCP wrapper** — registers the core as an MCP tool with schema and session guard

A centralized tool guard intercepts all MCP tool calls and rejects them with a standardized error if no session is
active. Transparent to MCP tool listing — tools always appear, but calls fail without a session.

## Structure

```
src/
├── index.ts              — server creation, tool registration, transport
├── types.ts              — Phase, StartContext, Grounding, Finding, ReviewSession
├── session.ts            — session state (get/set/requirePhase/sessionDict)
├── result.ts             — textResult/errorResult response helpers
├── llmxml/               — LLMXML markup builder (done)
│   ├── llmxml.ts
│   └── llmxml.test.ts
├── pathindex/            — file tree walker + fuzzy search (TODO)
├── lineiter/             — line iterator with binary detection (TODO)
└── tools/                — one file per tool, each exports register(server)
    ├── session-start.ts
    ├── session-state.ts
    ├── grounding-*.ts
    ├── finding-*.ts
    ├── surfacing-complete.ts
    ├── proving-complete.ts
    ├── review-complete.ts
    ├── git-*.ts           (TODO)
    ├── fs-*.ts            (TODO)
    └── search-*.ts        (TODO)
```

## Implementation Plan

### Phase 0: Infrastructure (pure library, no MCP)

- [x] **llmxml** — markup builder (`src/llmxml/`)
- [ ] **pathindex** — file tree walker + fuzzy search + glob/prefix filtering + directory children listing.
      Port from Go `searchtoolset/pathindex`. Foundation for `search-find-files` and `fs-dir-list`.
- [ ] **lineiter** — pull-style line iterator with binary detection (null-byte probe) and per-line byte cap.
      Port from Go `fstoolset/lineiter`. Foundation for `fs-file-read`.

### Phase 1: Session context + tool guard

- [ ] **session rework** — `session-start` becomes heavy init: takes root + mode, validates git, walks tree → builds
      pathindex, fetches commit message + diff + changed files. Stores all deterministic data.
- [ ] **tool guard** — centralized wrapper that intercepts all MCP tool calls, checks for active session, returns
      standardized error if none. Transparent to MCP tool listing.

### Phase 2: Tools (programmatic core + MCP wrapper each)

Session + git (start here):

- [ ] **session-start** — init pathindex, git context, deterministic data gathering
- [ ] **session-state** — current phase, session info (exists, needs session binding)
- [ ] **git-diff** — diff for review mode, context lines param
- [ ] **git-changed-files** — name-status list for review mode

Filesystem + search:

- [ ] **fs-file-read** — read file with line numbers, binary detection, line cap, path-miss suggestions from pathindex
- [ ] **fs-dir-list** — directory listing via pathindex children
- [ ] **search-find-files** — fuzzy file name search via pathindex (pattern, globs, prefixes, excludes, max results)
- [ ] **search-grep** — content search via ripgrep subprocess

Remaining git:

- [ ] **git-log** — commit history with format control
- [ ] **git-annotate** — blame/annotate

### Phase 3: Review tools rebinding

- [ ] Rebind existing review tools (grounding, surfacing, proving, filing) to session guard

## Pipeline

Four phases, strictly ordered. Each phase has dedicated tools that only work during that phase.

```
IDLE → GROUNDING → SURFACING → PROVING → FILING → COMPLETE
                                   ↘ (0 findings) ↗
```

## Conventions

- Each tool lives in its own file under `tools/`, exporting a `register(server: McpServer)` function
- Tool names are scoped: `session-*`, `grounding-*`, `finding-*`, `git-*`, `fs-*`, `search-*`
- Tool responses use `textResult(data)` / `errorResult(message)` helpers from `result.ts` (JSON until LLMXML wired)
- Session state is accessed via `getSession()` / `setSession()` — never import the variable directly
- Phase gating uses `requirePhase(...phases)` — returns an error string or undefined
- Infrastructure libraries (`pathindex`, `lineiter`, `llmxml`) are pure — no MCP dependency, independently testable
- Use `vp check` for formatting + linting + type-checking, `vp test` for tests

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
