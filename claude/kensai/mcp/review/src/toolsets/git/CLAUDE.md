# git toolset

Git tools for the review pipeline. Depends on RepoFs for the `Repo` instance
and path containment.

## Tools

| Tool            | Args                 | Purpose                              |
| --------------- | -------------------- | ------------------------------------ |
| `diff_file`     | path, context_lines? | Annotated diff for a single file     |
| `changed_files` | —                    | Name-status list for the review mode |
| `log`           | ref?, count?         | Commit history                       |

## GitToolset API

| Method        | Purpose                           |
| ------------- | --------------------------------- |
| `update(rfs)` | Inject RepoFs after session start |
| `clear()`     | Release RepoFs after session end  |
| `tools()`     | Return tool registrars            |

## Dependencies

- `RepoFs.git.diffFile()` — diff_file
- `RepoFs.git.changedFiles()` — changed_files
- `RepoFs.git.log()` — log
