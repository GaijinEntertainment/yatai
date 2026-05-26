# fs toolset

Filesystem and search tools scoped to the session's repository root. Depends on RepoFs for
path containment, file reading, index search, and ripgrep.

## Tools

| Tool         | Args                                                   | Purpose                               |
| ------------ | ------------------------------------------------------ | ------------------------------------- |
| `read_file`  | file_path, line_offset?, line_limit?                   | Read file with line numbers           |
| `find_files` | query, max_results?                                    | Fuzzy-search file paths in the index  |
| `list_dir`   | path, max_depth?, skip_dotfiles?                       | List directory entries from the index |
| `grep`       | pattern, root?, glob?, case_insensitive?, max_results? | Content search via ripgrep            |

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
