# findings toolset

Review findings lifecycle — surface, cancel, verdict, list, get. Owns the findings
registry internally; the session toolset orchestrates when these tools are available.

## Tools

| Tool              | Args                                              | Purpose                            |
| ----------------- | ------------------------------------------------- | ---------------------------------- |
| `finding_surface` | dimension, location, concern, evidence, severity  | Record a finding                   |
| `surface_clean`   | dimension, notes?                                 | Report a clean dimension           |
| `finding_cancel`  | finding_id, reason?                               | Retract a finding                  |
| `finding_verdict` | finding_id, verdict, reason, severity?, blocking? | Verdict: confirmed or rejected     |
| `findings_list`   | dimension?, status?                               | List findings with optional filter |
| `finding_get`     | finding_id                                        | Get a single finding               |

## FindingsToolset API

| Method        | Purpose                                             |
| ------------- | --------------------------------------------------- |
| `update(rfs)` | Lifecycle hook (findings don't use RepoFs directly) |
| `clear()`     | Flush findings registry on session end              |
| `tools()`     | Return tool registrars                              |

## Severity

`bug` > `concern` > `suggestion` > `nitpick`

## Verdict

- `confirmed` — finding survives falsification, included in final report
- `rejected` — finding fails falsification gates, excluded

## Finding Lifecycle

```
surface -> [pending] -> verdict -> [confirmed | rejected]
surface -> [pending] -> cancel -> [cancelled]
```

## Status Filter Values

`pending`, `confirmed`, `rejected`, `cancelled`
