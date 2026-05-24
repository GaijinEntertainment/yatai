# toolsets

MCP tool registration layer. Each subfolder is a toolset — a domain-scoped group of tools with shared
lifecycle and dependencies.

## Architecture

| Concept            | Type      | Purpose                                          |
| ------------------ | --------- | ------------------------------------------------ |
| `ToolRegistrar`    | interface | Deferred tool registration — name + factory      |
| `SessionDependant` | interface | Toolset with RepoFs lifecycle hooks              |
| `Session`          | interface | Active review session state                      |
| `SessionToolset`   | class     | Binder — registers all tools, manages visibility |

## Toolsets

| Toolset    | Folder      | Tools | Dependency            |
| ---------- | ----------- | ----- | --------------------- |
| Session    | `session/`  | 9     | None (always enabled) |
| Filesystem | `fs/`       | 4     | RepoFs                |
| Git        | `git/`      | 3     | RepoFs                |
| Findings   | `findings/` | 6     | Session state         |

## Registration Flow

1. Each toolset creates `ToolRegistrar[]` via `tools()`
2. `SessionToolset.bind(server)` registers all tools on the MCP server
3. Session tools are always enabled; dependant tools start disabled
4. `#sync()` enables/disables tools based on session state

## Adding a New Tool

1. Create `<tool_name>.ts` in the appropriate toolset folder
2. Export a factory function returning `ToolRegistrar`
3. Import and add to the toolset's `tools()` method
4. Tool handler receives parsed args directly (Zod schema keys, not `{ input }`)

## Adding a New Toolset

1. Create folder under `toolsets/`
2. Create `toolset.ts` implementing `SessionDependant`
3. Add tool files, wire in `tools()` method
4. Register as dependant in `src/index.ts`: `new SessionToolset([..., new MyToolset()])`
