# pathindex

Tree-structured file index with fuzzy and glob search. Built once at session start, immutable after construction.
Replaces per-call filesystem operations for file lookup, directory listing, and path suggestions.

## API

| Method                         | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `PathIndex.new(root, signal?)` | Async build — parallel walk + stat, symlink detection    |
| `PathIndex.from(root, paths)`  | Sync build from path strings (trailing `/` = directory)  |
| `get(path)`                    | O(1) entry lookup by relative path                       |
| `dir(path)`                    | O(1) directory node lookup                               |
| `globSearch(opts?)`            | Filter paths by include/exclude globs                    |
| `fuzzySearch(pattern, opts?)`  | Multi-word fuzzy search with optional glob pre-filtering |
| `validateGlobs(patterns)`      | Check glob patterns are compilable                       |

## Entry Types

Discriminated union on `type`:

- **`file`** — `name`, `size` (bytes), `lineCount` (0 for binary), `maxLineLen` (longest line in bytes, 0 for binary/empty), `isBinary` (null byte in leading 512 bytes)
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
- Symlinks indexed with target info but not followed for recursion
- Per file: `stat` (size) and `LineIter` body-less scan (line count + binary detection) run in parallel
- Binary detection via null byte probe on first 512 bytes — binary files get `lineCount: 0, isBinary: true`
- Paths stored as forward-slash POSIX relative to root

## Dependencies

- `fuzzysort` — SublimeText-style fuzzy scoring
- `picomatch` — glob compilation and matching
- `lineiter` — body-less line counting and binary detection during walk
