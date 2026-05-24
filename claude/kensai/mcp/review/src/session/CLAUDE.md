# session

Stateful domain logic for a review session. Three classes: `Session` (fat factory + data holder),
`FindingsStorage` (surfacing/proving lifecycle), `GroundingStorage` (observations + synthesized result).
Toolsets are stateless facades over these.

## Session

Fat `start()` factory — validates git, builds PathIndex, collects diffs and metadata in parallel.
All data is lossless; tools perform lossy transformations (collapsing, capping, formatting).

| Export                      | Purpose                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| `Session.start(root, mode)` | Async factory — returns fully populated session                          |
| `.id`                       | 40-char SHA1 hex, unique per session                                     |
| `.root`                     | Absolute repo path                                                       |
| `.mode`                     | `"committed" \| "uncommitted" \| "all"`                                  |
| `.phase`                    | Current `SessionPhase` — starts at `GROUNDING`                           |
| `.startedAt`                | Construction timestamp                                                   |
| `.rfs`                      | `RepoFs` instance                                                        |
| `.commit`                   | `GitLogEntry \| null` — HEAD commit; null for uncommitted mode           |
| `.changedFiles`             | All changed files with status and +/- stats                              |
| `.manifest`                 | Per-file shape metrics (bytes, lines, maxLineLen, binary) from PathIndex |
| `.diffs`                    | Per-file unified diffs (3-line context) for reviewable files             |
| `.findings`                 | `FindingsStorage` instance                                               |
| `.grounding`                | `GroundingStorage` instance                                              |
| `.advance(to)`              | Transition to the given phase — throws `SessionError` if invalid         |
| `SessionPhase`              | `"GROUNDING" \| "SURFACING" \| "PROVING" \| "FILING" \| "COMPLETE"`      |
| `ReviewMode`                | `"committed" \| "uncommitted" \| "all"`                                  |
| `FileDiff`                  | `{ path, content }`                                                      |
| `ManifestEntry`             | `{ path, bytes, lines, maxLineLen, binary }`                             |
| `SessionError`              | Error class for session failures                                         |

### Phase state machine

```
GROUNDING → SURFACING → PROVING → FILING → COMPLETE
                           \- (0 findings) -/
```

| From      | To        | Precondition              |
| --------- | --------- | ------------------------- |
| GROUNDING | SURFACING | grounding result stored   |
| SURFACING | PROVING   | findings > 0              |
| SURFACING | FILING    | 0 findings (skip proving) |
| PROVING   | FILING    | no pending findings       |
| FILING    | COMPLETE  | —                         |

Invalid transitions throw `SessionError`.

### Review modes

| Mode          | Base     | Head         | Commit      |
| ------------- | -------- | ------------ | ----------- |
| `committed`   | `HEAD~1` | `HEAD`       | HEAD commit |
| `uncommitted` | `HEAD`   | working tree | null        |
| `all`         | `HEAD~1` | working tree | HEAD commit |

### Diff filtering

Ported from Go harness `priming/diff.go`. Three-tier skip logic:

- Collapsed prefixes: `vendor/`, `node_modules/`, `dist/`, `build/`, `__pycache__/`, `.git/`
- Exact lock files: `go.sum`, `yarn.lock`, `package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`, `Gemfile.lock`, `composer.lock`, `poetry.lock`, `Pipfile.lock`
- Generated suffixes: `.pb.go`, `.gen.go`, `_generated.go`, `.min.js`, `.min.css`, `.map`

Deleted files excluded from both diffs and manifest. Skipped files excluded from diffs only -- still present in `changedFiles` and `manifest`.

### Exported filter functions

- `shouldSkipDiff(path)` — true if file matches any skip rule
- `filterReviewableFiles(files)` — excludes deleted + skip-diff files

## FindingsStorage

In-memory findings registry. Lifecycle: `surface` -> `verdict` or `cancel`. Sequential IDs (F1, F2, ...).

| Method                                                      | Purpose                             |
| ----------------------------------------------------------- | ----------------------------------- |
| `surface(dimension, severity, location, concern, evidence)` | Record a finding, returns ID        |
| `cancel(id, reason?)`                                       | Retract a pending finding           |
| `verdict(id, result, reason, severity?, blocking?)`         | Confirm or reject a pending finding |
| `get(id)`                                                   | Lookup by ID                        |
| `list(filter?)`                                             | Filter by dimension and/or status   |
| `count()`                                                   | Total findings count                |

### Types

- `Severity` — `"bug" \| "concern" \| "suggestion" \| "nitpick"`
- `FindingStatus` — `"pending" \| "confirmed" \| "rejected" \| "cancelled"`
- `Finding` — id, dimension, severity, location, concern, evidence, status, verdict?, cancelReason?
- `Verdict` — result, reason, severity? (confirmed only), blocking? (confirmed only)

### Constraints

- Only pending findings can be cancelled or verdicted
- IDs are sequential and never reused

## GroundingStorage

Two-layer storage: incremental observations (O1, O2, ...) during exploration + one-shot synthesized result.

| Method                                                     | Purpose                                  |
| ---------------------------------------------------------- | ---------------------------------------- |
| `createObservation(summary, detail, location?, category?)` | Record observation, returns ID           |
| `cancelObservation(id, reason?)`                           | Mark observation as disproved            |
| `observations()`                                           | All observations including cancelled     |
| `storeResult(result)`                                      | Store synthesized grounding — write-once |
| `result()`                                                 | Get stored result or null                |
| `hasContent()`                                             | Whether result has been stored           |

### Types

- `Observation` — id, summary, detail, location?, category?, cancelled, cancelReason?
- `GroundingNote` — `{ location, description }` — used in hotspots and blindspots
- `GroundingResult` — summary, integrationSurface, intent, hotspots?, blindspots?

### Constraints

- `storeResult` throws if result already stored — no overwriting
- Cancelled observations cannot be cancelled again

## Dependencies

- `node:crypto` (Session ID generation)
- `../repofs/repofs.ts` (RepoFs)
- `../repofs/git/git.ts` (GitFileStat, GitLogEntry)
