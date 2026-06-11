# gitignore

Gitignore pattern matching ported from the Go reference implementation. Parses `.gitignore` syntax into compiled
matchers and chains them hierarchically for walk-time filtering.

## API

| Export                    | Purpose                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `parse(content, dir)`     | Parse a `.gitignore` body into a `Matcher`. `dir` is the file's directory relative to root (`""` for root) |
| `parsePattern(line, dir)` | Compile one gitignore line. Returns `null` for blanks, comments, invalid patterns                          |
| `Matcher`                 | Immutable pattern list with optional parent chain                                                          |
| `.match(relPath, isDir)`  | `true` if the path is ignored. Last-match-wins; own patterns checked before parent chain                   |
| `.append(...patterns)`    | New `Matcher` layered on top of this one                                                                   |
| `.withParent(parent)`     | Rechain onto a new parent; collapses to `parent` when this matcher is empty                                |
| `MatchResult`, `Pattern`  | Pattern interface and per-pattern match result (`no-match` / `exclude` / `include`)                        |

## Semantics

- Full gitignore syntax: negation (`!`), dir-only trailing `/`, anchoring (leading or interior `/`), `**` globs,
  character classes, escaped `#` / `!` / trailing space
- `[!abc]` character classes normalized to picomatch's `[^abc]`
- Globs match dotfiles; braces and extglobs are literal — gitignore has no brace expansion
- Basename patterns (no slash) match at any depth below the defining directory; patterns with a slash are anchored to
  it (compiled with a `dir/` prefix)
- Nested `.gitignore` scoping is by construction: consumers consult a directory's matcher chain only for paths under
  that directory

## Consumers

- `pathindex` — walk-time filtering: per-directory `.gitignore` chained onto the parent matcher, `.git/info/exclude`
  seeds the root chain

## Dependencies

- `picomatch` — glob compilation
- `node:path/posix` (basename)
