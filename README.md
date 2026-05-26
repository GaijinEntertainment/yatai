# yatai

Gaijin Entertainment's plugin marketplace for AI coding tools.

Plugins built for internal workflows — code review pipelines, development automation, quality enforcement — published
for anyone to use.

## Installation

Add the marketplace, then install any plugin:

```
/plugin marketplace add GaijinEntertainment/yatai
/plugin install <plugin-name>
```

## Plugins

### kensai

Multi-agent code review with adversarial falsification. Parallel reviewers surface issues; a prover applies
falsification gates to filter false positives. Orchestrated by a stateful MCP server
([`@gaijin/kensai-review-mcp`](https://www.npmjs.com/package/@gaijin/kensai-review-mcp)).

Requires Node.js 26+ and agent teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`).

```
/plugin install kensai
```

## Requirements

- [Claude Code](https://claude.com/claude-code) with plugin marketplace support
- Node.js 26+ (for MCP server plugins)

## License

MIT
