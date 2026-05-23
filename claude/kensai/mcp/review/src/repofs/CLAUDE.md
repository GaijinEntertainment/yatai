# repofs

Scoped filesystem facade for a git repository. Composes PathIndex (file discovery), Repo (git operations),
and ripgrep (content search) behind a containment layer that prevents path escape.
Single entry point for all filesystem and search operations within a project root.

## API

| Export                           | Purpose                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| `RepoFs.open(root, signal?)`     | Async factory. Builds file index and validates git in parallel   |
| `.root`                          | Absolute path to repository root                                 |
| `.git`                           | `Repo` instance for git operations                               |
| `.index`                         | `PathIndex` instance — O(1) lookup, fuzzy search, glob filter    |
| `.resolve(path)`                 | Normalize any path to POSIX relative from root. Throws on escape |
| `.fileExists(path)`              | Check file existence via index                                   |
| `.dirExists(path)`               | Check directory existence via index                              |
| `.readFile(path, opts?)`         | Read text file with binary detection, line windowing, byte cap   |
| `.listDir(path, opts?)`          | List directory entries from index tree with depth control        |
| `.findFiles(pattern, opts?)`     | Fuzzy search file paths via PathIndex                            |
| `.globFiles(opts?)`              | Glob-filter indexed paths via PathIndex                          |
| `.grep(pattern, opts?, signal?)` | Content search via ripgrep scoped to root                        |
| `.flushReadPaths()`              | Return and clear paths from successful readFile calls            |
| `RepoFsError`                    | Error class for scoped filesystem failures                       |

## Path Resolution

`resolve()` is the single gate for all path input:

1. Accepts absolute or relative paths
2. Normalizes to POSIX (backslash → forward slash, `posix.normalize`)
3. Resolves against root via `path.resolve`
4. Checks containment via `path.relative` — rejects if result starts with `..`
5. Returns the POSIX relative path from root (index-compatible)

All index lookups, error messages, and read tracking use the resolved relative path.
The only place that needs the absolute path is `createReadStream` in `readFile`.

## File Reading

Validation chain (all index-based, no stat calls):

1. `resolve()` — containment
2. `index.get()` — existence, rejects dirs and symlinks by entry type
3. Binary extension check
4. Byte limit enforcement (when no explicit `lineLimit`)
5. Streaming read via `LineIter` with binary probe and per-line byte cap

Returns `ReadResult` with `lines` (num, content, fullLen), `truncated`, `empty`, `pastEof`.
Records successful reads for future instruction resolution via `flushReadPaths()`.

### ReadFileOptions

| Option            | Default | Purpose                                           |
| ----------------- | ------- | ------------------------------------------------- |
| `lineOffset`      | 1       | Start line (1-based)                              |
| `lineLimit`       | 2000    | Max lines returned                                |
| `lineLengthCap`   | 1024    | Per-line byte cap before truncation               |
| `binaryProbeSize` | 512     | Bytes scanned for null byte detection             |
| `byteLimit`       | 256 KB  | Reject files over this without explicit lineLimit |
| `signal`          | —       | AbortSignal for cancellation                      |

## Directory Listing

Traverses the PathIndex tree — no filesystem I/O at list time.
Index is built once at `open()` and reflects the state at that point.

Returns `ListResult` with `entries` (path, name, isDir, isSymlink, size) and `truncated`.
Entries sorted by name within each level. Excluded directories are listed but not descended into.

### ListDirOptions

| Option         | Default                                              | Purpose                                   |
| -------------- | ---------------------------------------------------- | ----------------------------------------- |
| `maxDepth`     | 1                                                    | Recursion depth. 1 = direct children only |
| `maxEntries`   | 1000                                                 | Maximum entries before truncation         |
| `skipDotfiles` | false                                                | Omit entries starting with "."            |
| `excludeDirs`  | vendor, node_modules, .git, dist, build, **pycache** | Skip descent into these directories       |

## Containment

`resolve()` prevents path escape via textual containment: `path.relative(root, abs)` must not
start with `..`. Symlinks are safe because PathIndex does not traverse them — symlinked entries
appear in the index with `type: "symlink"` and `readFile` rejects them by type.

## Dependencies

- `node:fs` (createReadStream)
- `node:fs/promises` (stat — only in `open()`)
- `node:path` (resolve, relative, posix.normalize, posix.basename, posix.dirname, posix.extname)
- `../git/git.ts` (Repo)
- `../lineiter/lineiter.ts` (LineIter, ErrBinaryContent)
- `../pathindex/pathindex.ts` (PathIndex, FilterOptions, IndexEntryDir)
- `../rg/rg.ts` (grep, GrepOptions, GrepResult)
