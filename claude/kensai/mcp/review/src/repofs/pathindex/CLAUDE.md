# pathindex

Tree-structured file index with fuzzy and glob search. Built once at session start; afterwards entries are only
enriched — lazy size fills, `add()` reconciliation — never removed or restructured.
Replaces per-call filesystem operations for file lookup, directory listing, and path suggestions.

## API

| Method                         | Purpose                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PathIndex.new(root, signal?)` | Async build — gitignore-aware stat-free parallel walk, symlink resolution. Works on any directory tree, git or not                                                                   |
| `PathIndex.from(root, paths)`  | Sync build from path strings (trailing `/` = directory)                                                                                                                              |
| `add(relPaths)`                | Insert paths the walk pruned (e.g. changed tracked-but-ignored files, reconciled by the review layer) — lstat-classified, size filled, already-indexed and nonexistent paths skipped |
| `get(path)`                    | O(1) entry lookup by relative path                                                                                                                                                   |
| `dir(path)`                    | O(1) directory node lookup                                                                                                                                                           |
| `globSearch(opts?)`            | Filter paths by include/exclude globs                                                                                                                                                |
| `fuzzySearch(pattern, opts?)`  | Multi-word fuzzy search with optional glob pre-filtering                                                                                                                             |
| `validateGlobs(patterns)`      | Check glob patterns are compilable                                                                                                                                                   |

## Entry Types

Discriminated union on `type`:

- **`file`** — `name`, `size` (bytes; null at build time — lazily filled by `RepoFs.readFile` or manifest stat), `isBinary` (extension-based hint; content probe runs at read/scan time). Line metrics are not stored — `countFileLines` computes them on demand
- **`dir`** — `name`, `children: IndexEntry[]`
- **`symlink`** — `name`, `target` (raw readlink), `targetType`, `size` (target's size if file)

## Fuzzy Search

Powered by `fuzzysort` (SublimeText-style scoring — character-by-character with boundary bonuses for path separators
and camelCase).

Multi-word queries use a waterfall: each space-separated word fuzzy-matches the survivors of the previous word,
narrowing progressively. `"handler auth"` first finds all paths matching "handler", then fuzzy-matches "auth" within
those results. Final order is by the last word's score.

Both `globSearch` and `fuzzySearch` accept the same `FilterOptions` (`includes`/`excludes`/`maxResults`). In
`fuzzySearch`, glob filters are applied before the fuzzy waterfall — they narrow the candidate set, not the results.

## Glob Semantics

Powered by `picomatch`. Pattern without `/` uses `matchBase` (matches basename at any depth):

- `*.go` → matches `main.go` and `src/pkg/main.go`
- `src/**` → matches only under `src/`
- `**/.git/**` → matches `.git` at any depth

## Walker

- Async recursive with parallel child dispatch (`Promise.all` per directory)
- Gitignore-aware: each directory's `.gitignore` is parsed and chained onto the parent matcher;
  `.git/info/exclude` seeds the root chain
- Ignored files are omitted; ignored directories are pruned without descent — `!` re-inclusion
  inside a pruned directory is impossible, matching git. Tracked-but-ignored files are absent
  from the index (still readable via the `RepoFs.readFile` fallback)
- Symlinks indexed with target info (readlink + stat) but not followed for recursion; ignore rules match them as files
- Files are never statted at build — entries are created from the dirent alone. Size is lazily
  filled (`RepoFs.readFile`, manifest stat); line metrics and content-based binary detection are
  computed on demand by `countFileLines`, never stored on the entry
- Paths stored as forward-slash POSIX relative to root

## Dependencies

- `fuzzysort` — SublimeText-style fuzzy scoring
- `picomatch` — glob compilation and matching
- `../git/gitignore` — walk-time ignore filtering
- `lineiter` — on-demand line counting and binary detection (`countFileLines`)
