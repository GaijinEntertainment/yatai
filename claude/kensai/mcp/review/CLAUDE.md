# Kensai Review MCP Server

Stateful stdio MCP server for the kensai code review pipeline. Single active session per server instance — all tools are
bound to the session's project root. Tool names are scoped by entity: `session-*`, `grounding-*`, `finding-*`, etc.

Response format: LLMXML (pseudo-XML optimized for LLM consumption) — see `src/llmxml/`.

## Architecture

`session-start` performs heavy initialization: validates git, walks the file tree to build a path index (tree-structured
with file sizes and symlink detection), fetches deterministic data (commit message, diff, changed files). All subsequent
tools operate within the session's project root.

Every tool has two layers:

- **Programmatic core** — pure function, callable internally (e.g., session-start calls the indexer)
- **MCP wrapper** — registers the core as an MCP tool with schema and session guard

A centralized tool guard intercepts all MCP tool calls and rejects them with a standardized error if no session is
active. Transparent to MCP tool listing — tools always appear, but calls fail without a session.

## Structure

```
src/
├── index.ts              — server creation, tool registration, transport
├── llmxml/               — pseudo-XML markup builder for LLM responses
│   ├── llmxml.ts
│   ├── llmxml.test.ts
│   └── CLAUDE.md
├── repofs/               — scoped filesystem facade composing all sub-modules
│   ├── repofs.ts
│   ├── repofs.test.ts
│   ├── CLAUDE.md
│   ├── git/              — thin git CLI abstraction with diff annotation
│   ├── rg/               — ripgrep CLI abstraction for content search
│   ├── pathindex/        — tree-structured file index with fuzzy/glob search
│   └── lineiter/         — streaming line iterator with pluggable binary detection
└── tools/                — one file per tool (TODO)
```

## Implementation Plan

### Phase 0: Infrastructure (pure library, no MCP)

- [x] **llmxml** — pseudo-XML markup builder. Fluent element API, scalar attributes, one-shot content.
- [x] **pathindex** — tree-structured file index. Async parallel walker with per-file stat, symlink
      detection, fuzzy search (fuzzysort, multi-word waterfall), glob filtering (picomatch, include/exclude).
      O(1) entry and directory lookup. See `src/pathindex/CLAUDE.md`.
- [x] **lineiter** — streaming line iterator with pluggable binary detection and per-line byte cap.
      Consumes `AsyncIterable<Buffer>` (e.g. `createReadStream`). Port from Go `fstoolset/lineiter`.
      Foundation for `fs-file-read`. See `src/lineiter/CLAUDE.md`.
- [x] **git** — thin git CLI abstraction. `Repo` class with `open`, `diffFile`, `changedFiles`, `log`.
      Diff annotation utilities (`annotateDiff`, `parseHunkStart`, `countDiffLines`).
      Port from Go `git/repo.go` + `gittoolset/annotate.go`. See `src/git/CLAUDE.md`.
- [x] **rg** — ripgrep CLI abstraction. `grep(root, pattern, options?, signal?)` with multi-target
      support (`string[]`), output truncation, and configurable directory exclusions.
      Port from Go `tools/v2/searchtoolset/grep.go`. See `src/rg/CLAUDE.md`.
- [x] **repofs** — scoped filesystem facade. Composes PathIndex, Repo, and rg behind containment
      layer (path escape prevention, symlink rejection). Provides `readFile` (lineiter-based with
      binary detection, line windowing), `listDir` (index-based traversal with depth control),
      `findFiles`/`globFiles` (pathindex delegation), `grep` (rg delegation), and read tracking
      for future instruction resolution. See `src/repofs/CLAUDE.md`.

### Phase 1: Session context + tool guard

- [ ] **session rework** — `session-start` becomes heavy init: takes root + mode, validates git, builds
      pathindex, fetches commit message + diff + changed files. Stores all deterministic data.
- [ ] **tool guard** — centralized wrapper that intercepts all MCP tool calls, checks for active session, returns
      standardized error if none. Transparent to MCP tool listing.

### Phase 2: Tools (programmatic core + MCP wrapper each)

Session + git:

- [ ] **session-start** — init pathindex, git context, deterministic data gathering
- [ ] **session-state** — current phase, session info
- [ ] **git-diff** — diff for review mode, context lines param
- [ ] **git-changed-files** — name-status list for review mode

Filesystem + search:

- [ ] **fs-file-read** — read file with line numbers, binary detection, line cap, path-miss suggestions via
      `fuzzySearch`
- [ ] **fs-dir-list** — directory listing via pathindex tree (`dir()` -> render children with sizes)
- [ ] **search-find-files** — file search via pathindex `globSearch`/`fuzzySearch`
- [ ] **search-grep** — content search via ripgrep subprocess

Remaining git:

- [ ] **git-log** — commit history with format control
- [ ] **git-annotate** — blame/annotate

### Phase 3: Review tools rebinding

- [ ] Rebind existing review tools (grounding, surfacing, proving, filing) to session guard

## Pipeline

Four phases, strictly ordered. Each phase has dedicated tools that only work during that phase.

```
IDLE -> GROUNDING -> SURFACING -> PROVING -> FILING -> COMPLETE
                                    \- (0 findings) -/
```

## Conventions

- Each tool lives in its own file under `tools/`, exporting a `register(server: McpServer)` function
- Tool names are scoped: `session-*`, `grounding-*`, `finding-*`, `git-*`, `fs-*`, `search-*`
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
