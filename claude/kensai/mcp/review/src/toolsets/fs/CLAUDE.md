# fs toolset

Filesystem and search tools scoped to the session's repository root. Depends on RepoFs for
path containment, file reading, index search, and ripgrep.

## Tools

| Tool         | Args                                | Purpose                               |
| ------------ | ----------------------------------- | ------------------------------------- |
| `read_file`  | path, line_offset?, line_limit?     | Read file with line numbers           |
| `find_files` | pattern, limit?                     | Fuzzy-search file paths in the index  |
| `list_dir`   | path?, max_depth?, max_entries?     | List directory entries from the index |
| `grep`       | pattern, include?, exclude?, limit? | Content search via ripgrep            |

## FsToolset API

| Method        | Purpose                           |
| ------------- | --------------------------------- |
| `update(rfs)` | Inject RepoFs after session start |
| `clear()`     | Release RepoFs after session end  |
| `tools()`     | Return tool registrars            |

## Dependencies

- `RepoFs.readFile()` — read_file
- `RepoFs.findFiles()` / `RepoFs.globFiles()` — find_files
- `RepoFs.index.dir()` — list_dir
- `RepoFs.grep()` — grep
