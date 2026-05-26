# rg

Thin abstraction over the ripgrep CLI for content search. Ported from Go `tools/v2/searchtoolset/grep.go`.
Foundation for the `search-grep` tool.

## API

| Export                                   | Purpose                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `grep(root, pattern, options?, signal?)` | Search file contents under root using ripgrep                                                |
| `GrepOptions`                            | Options: target, glob, caseInsensitive, maxResults, contextLines, maxLineLength, excludeDirs |
| `DEFAULT_EXCLUDE_DIRS`                   | Default excluded dirs: `.git`, `vendor`, `node_modules`, `dist`, `build`, `__pycache__`      |
| `GrepResult`                             | `{ output, lineCount, truncated }` — raw rg output with metadata                             |
| `RgError`                                | Error class for rg failures. Includes stderr, original cause                                 |
| `parseRgVersion(output)`                 | Extract `{ major, minor, patch }` from `rg --version` output                                 |
| `processOutput(stdout, maxResults)`      | Post-process rg stdout: strip `./`, apply truncation                                         |

## Ripgrep CLI

- Uses `execFile` with argument arrays (no shell injection)
- `--no-ignore --hidden` to search all files including gitignored/hidden
- Default excluded directories: `.git`, `vendor`, `node_modules`, `dist`, `build`, `__pycache__`
- `--with-filename --line-number --no-heading` for consistent output format
- `--max-columns` + `--max-columns-preview` for line truncation
- `--color=never` for parseable output
- `--path-separator /` for cross-platform path consistency
- rg binary bundled via `@vscode/ripgrep` — no PATH dependency
- Binary check runs once per process, cached via singleton promise
- 50 MiB max buffer for large outputs
- Exit code 1 (no matches) → valid empty result, not an error

## Multi-target Search

`target` is `string[]` — always an array. Agents can pass multiple paths to search.
Each path is relative to root. rg natively supports multiple path arguments.

## Configurable Exclusions

`excludeDirs` defaults to `DEFAULT_EXCLUDE_DIRS`. Pass `[]` to disable all directory exclusions.

## Output Format

Raw rg output: `path:line:content` for matches, `path-line-content` for context, `--` between groups.
Leading `./` is stripped. Output is truncated to `maxResults` non-separator lines.

## Dependencies

- `@vscode/ripgrep` (bundled rg binary path)
- `node:child_process` (execFile)
- `node:path` (resolve)
