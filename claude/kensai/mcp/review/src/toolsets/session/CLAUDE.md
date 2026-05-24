# session toolset

Session lifecycle management and phase transitions. Acts as the tool registry — binds its own
tools plus all dependant toolset tools to the MCP server.

## Tools

| Tool                 | Args         | Purpose                                        |
| -------------------- | ------------ | ---------------------------------------------- |
| `session_start`      | root, mode?  | Fat init: RepoFs, PathIndex, git context       |
| `session_state`      | —            | Current session info                           |
| `session_end`        | —            | Clear dependants, destroy session              |
| `grounding_store`    | key, content | Persist grounding context                      |
| `grounding_get`      | key?         | Retrieve grounding context                     |
| `grounding_complete` | —            | GROUNDING -> SURFACING                         |
| `surfacing_complete` | —            | SURFACING -> PROVING (or FILING if 0 findings) |
| `proving_complete`   | —            | PROVING -> FILING                              |
| `filing_complete`    | —            | FILING -> COMPLETE                             |

## Review Modes

| Mode          | Compares             | Description                  |
| ------------- | -------------------- | ---------------------------- |
| `committed`   | HEAD~1..HEAD         | Topmost commit only          |
| `uncommitted` | HEAD..working tree   | Uncommitted changes only     |
| `all`         | HEAD~1..working tree | Topmost commit + uncommitted |

## SessionToolset API

| Method                    | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `constructor(dependants)` | Accept SessionDependant toolsets                   |
| `bind(server)`            | Register all tools; dependant tools start disabled |
| `session` (getter)        | Current session or null                            |

## Internals

- `#ownTools()` — creates session tool registrars with context callbacks
- `#sync()` — converges tool visibility to match `#enabledTools()` result
- `#enabledTools()` — own tools always enabled; dependant tools enabled when session active

## Tool File Pattern

Each tool file exports a factory receiving a context interface:

```typescript
interface StartContext {
	getSession(): Session | null;
	start(root: string, mode: "committed" | "uncommitted" | "all"): Promise<void>;
}

function sessionStartTool(ctx: StartContext): ToolRegistrar;
```

The context interface exposes only what the tool needs from SessionToolset.
SessionToolset provides the implementation via closures in `#ownTools()`.
