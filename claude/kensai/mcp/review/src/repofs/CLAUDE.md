# repofs

Scoped filesystem facade for a git repository. Composes PathIndex (file discovery), Repo (git operations),
and ripgrep (content search) behind a containment layer that prevents path escape.
Single entry point for all filesystem and search operations within a project root.

## API

| Export                           | Purpose                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `RepoFs.open(root, signal?)`     | Async factory. Builds gitignore-aware index (pure filesystem walk) and validates git in parallel                                          |
| `.root`                          | Absolute path to repository root                                                                                                          |
| `.git`                           | `Repo` instance for git operations                                                                                                        |
| `.index`                         | `PathIndex` instance — O(1) lookup, fuzzy search, glob filter. Gitignore-filtered walk; review layer reconciles changed files via `add()` |
| `.resolve(path)`                 | Normalize any path to POSIX relative from root. Throws on escape                                                                          |
| `.fileExists(path)`              | Check file existence via index                                                                                                            |
| `.dirExists(path)`               | Check directory existence via index                                                                                                       |
| `.readFile(path)`                | Validate via index, return raw bytes. Lazily fills the entry's size; lstat fallback for unindexed paths                                   |
| `.findFiles(pattern, opts?)`     | Fuzzy search file paths via PathIndex                                                                                                     |
| `.globFiles(opts?)`              | Glob-filter indexed paths via PathIndex                                                                                                   |
| `.grep(pattern, opts?, signal?)` | Content search via ripgrep scoped to root                                                                                                 |
| `.flushReadPaths()`              | Return and clear paths from successful readFile calls                                                                                     |
| `RepoFsError`                    | Error class for scoped filesystem failures                                                                                                |

## Path Resolution

`resolve()` is the single gate for all path input:

1. Accepts absolute or relative paths
2. Normalizes to POSIX (backslash → forward slash, `posix.normalize`)
3. Resolves against root via `path.resolve`
4. Checks containment via `path.relative` — rejects if result starts with `..`
5. Returns the POSIX relative path from root (index-compatible)

All index lookups, error messages, and read tracking use the resolved relative path.
The only place that needs the absolute path is `fsp.readFile` (and the fallback `lstat`) in `readFile`.

## File Reading

`readFile` validates and returns raw bytes — line windowing, binary probing, and length caps live in
the `read_file` tool (`src/toolsets/fs/read_file.ts`):

1. `resolve()` — containment
2. `index.get()` — rejects non-file entries (dirs, symlinks) by type
3. Unindexed paths fall back to the filesystem: first segment must not be in `WALK_EXCLUDE_DIRS`,
   `lstat` must report a regular file (symlinks rejected)
4. `fsp.readFile` — fills the index entry's lazy `size` from the buffer length
5. Records the read path for instruction resolution via `flushReadPaths()`

Directory listing has no RepoFs method — the `list_dir` tool (`src/toolsets/fs/list_dir.ts`)
traverses `.index.dir()` directly.

## Containment

`resolve()` prevents path escape via textual containment: `path.relative(root, abs)` must not
start with `..`. Symlinks are safe because PathIndex does not traverse them — symlinked entries
appear in the index with `type: "symlink"` and `readFile` rejects them by type. The `readFile`
fallback for unindexed paths uses `lstat` and rejects non-regular files, so a gitignored symlink
cannot bypass containment.

## Dependencies

- `node:fs/promises` (stat in `open()`, readFile + fallback lstat in `readFile`)
- `node:path` (resolve, relative, posix.normalize)
- `../git/git.ts` (Repo)
- `../pathindex/pathindex.ts` (PathIndex, WALK_EXCLUDE_DIRS, FilterOptions)
- `../rg/rg.ts` (grep, GrepOptions, GrepResult)
