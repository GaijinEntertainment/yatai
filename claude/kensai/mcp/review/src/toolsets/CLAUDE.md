# toolsets

MCP tool registration layer. Each subfolder is a toolset — a domain-scoped group of tools with shared
lifecycle and dependencies.

## Architecture

| Concept            | Type      | Purpose                                                     |
| ------------------ | --------- | ----------------------------------------------------------- |
| `ToolRegistrar`    | interface | Deferred tool registration — name + factory                 |
| `ToolContext`      | interface | Lazy accessors for session state (rfs, findings, grounding) |
| `SessionDependant` | interface | Toolset whose tools depend on an active session             |
| `SessionToolset`   | class     | Binder — registers all tools, manages visibility            |

## Response Helpers (`result.ts`)

All tool handlers return `CallToolResult` via three helpers:

| Helper           | Purpose                                            |
| ---------------- | -------------------------------------------------- |
| `ok(...texts)`   | Success response — one or more text content blocks |
| `err(...texts)`  | Error response — sets `isError: true`              |
| `errFrom(error)` | Error from caught exception — extracts `.message`  |

## Toolsets

| Toolset    | Folder      | Tools | Dependency            |
| ---------- | ----------- | ----- | --------------------- |
| Session    | `session/`  | 11    | None (always enabled) |
| Filesystem | `fs/`       | 4     | RepoFs                |
| Git        | `git/`      | 3     | RepoFs                |
| Findings   | `findings/` | 6     | Session state         |

## Registration Flow

1. Each toolset creates `ToolRegistrar[]` via `tools(ctx)`
2. `SessionToolset.bind(server)` registers all tools on the MCP server
3. Session tools are always enabled; dependant tools start disabled
4. `#sync()` enables/disables tools based on session state

## Tool File Pattern

Each tool file follows a consistent structure:

```typescript
// 1. Schema — module-level z.object()
const inputSchema = z.object({
	param: z.string().describe("..."),
});
type Input = z.infer<typeof inputSchema>;

// 2. Handler — standalone function, flat indentation
function handle(ctx: ToolContext, args: Input) {
	// domain logic
	return ok("result");
}

// 3. Factory — thin wrapper returning ToolRegistrar
export function myTool(ctx: ToolContext): ToolRegistrar {
	return {
		name: "my_tool",
		register(server) {
			return server.registerTool("my_tool", { description: "...", inputSchema }, (args) => handle(ctx, args));
		},
	};
}
```

Tools without input omit `inputSchema` and `Input`. Error handling uses `errFrom()` around
domain calls that may throw, and `err()` for precondition checks.

## Adding a New Tool

1. Create `<tool_name>.ts` in the appropriate toolset folder
2. Define `inputSchema` with `z.object()`, derive `Input` type
3. Write a `handle()` function using `ok()`/`err()`/`errFrom()`
4. Export a factory function returning `ToolRegistrar`
5. Import and add to the toolset's `tools()` method

## Adding a New Toolset

1. Create folder under `toolsets/`
2. Create `toolset.ts` implementing `SessionDependant`
3. Add tool files, wire in `tools()` method
4. Register as dependant in `src/index.ts`: `new SessionToolset([..., new MyToolset()])`
