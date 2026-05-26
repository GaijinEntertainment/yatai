# @gaijin/kensai-review-mcp

Stateful MCP server for the [kensai](https://github.com/GaijinEntertainment/yatai/tree/main/claude/kensai) multi-agent
code review pipeline.

Provides 24 tools across 4 toolsets (session lifecycle, filesystem, git, findings) with phase-enforced state machine,
paginated context delivery, and scoped filesystem access.

## Usage

This package is consumed as an MCP server via the kensai Claude Code plugin. Install the plugin:

```
/plugin marketplace add GaijinEntertainment/yatai
/plugin install kensai
```

Or run standalone:

```
npx @gaijin/kensai-review-mcp
```

## Requirements

- Node.js 26+

## License

MIT
