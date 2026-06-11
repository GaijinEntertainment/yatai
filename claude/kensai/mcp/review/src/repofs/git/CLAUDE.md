# git

Thin abstraction over the local git CLI. Ported from Go `git/repo.go` and `gittoolset/annotate.go`.
Foundation for `git-diff`, `git-changed-files`, `git-log` tools.
Contains the `gitignore/` submodule (pattern matching for walk-time filtering) — see its `CLAUDE.md`.

## API

| Export                                                    | Purpose                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| `Repo.open(path, signal?)`                                | Async factory. Validates git repo, checks git CLI version >= 2 |
| `repo.path`                                               | Absolute path to repository root                               |
| `repo.diffFile(base, head, path, contextLines?, signal?)` | Unified diff for one file between revisions                    |
| `repo.changedFiles(base, head, signal?)`                  | Per-file change stats (path, status, +/-)                      |
| `repo.log(ref, count, signal?)`                           | Recent commits as `{ sha, subject }` entries                   |
| `FileStat`                                                | `{ path, status, additions, deletions }` interface             |
| `LogEntry`                                                | `{ sha, subject, body, author, authorEmail, date }` interface  |
| `GitError`                                                | Error class for git failures. Includes stderr, original cause  |
| `parseGitVersion(output)`                                 | Extract `{ major, minor }` from `git --version` output         |
| `annotateDiff(raw)`                                       | Annotate unified diff lines with new-file line numbers         |
| `parseHunkStart(header)`                                  | Extract new-file start line from hunk header                   |
| `countDiffLines(diff)`                                    | Count additions and deletions in raw diff                      |

## Git CLI

- Uses `execFile` with argument arrays (no shell injection)
- Sets `GIT_LITERAL_PATHSPECS=1` for all repo operations
- Git version check runs once per process, cached via singleton promise
- Minimum required version: 2.0
- 50 MiB max buffer for large outputs (e.g. `changedFiles` on repos with thousands of changed files)

## Diff Annotation

`annotateDiff` prefixes each hunk line with the new-file line number:

- Context: `%4d   <content>`
- Addition: `%4d + <content>`
- Deletion: `   -   <content>`

Used by the diff tool and review pipeline for precise line references.

## Dependencies

- `node:child_process` (execFile)
- `node:path` (resolve)
- `node:process` (env)
