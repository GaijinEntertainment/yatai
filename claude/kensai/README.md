# Kensai

Kensai is an AI-powered code review plugin for Claude Code. The name blends the Japanese _kensa_ (検査) — "inspection"
— with _AI_. A secondary reading, _kensai_ (剣聖, "sword saint"), evokes the precision of a master swordsman: a
reviewer that cuts with exactness.

## The Problem

Code review is a bottleneck. Human reviewers skim past mechanical issues — missing error handling, stale references,
integration gaps — because their attention is consumed by the volume of changes. Automated linters catch syntax and
style, but miss semantic problems that require understanding what the code _does_.

## The Solution

Kensai runs a multi-agent review pipeline with adversarial falsification. Instead of one pass through the diff, it
separates comprehension, discovery, and verification into distinct phases with dedicated agents:

1. **Grounding** — a dedicated agent maps the change: what moved, what it touches, what the author intended. Builds a
   three-layer model (Plan / Intent / Reality) that anchors all subsequent review work.

2. **Surfacing** — parallel agents review the change through different lenses (design, integration, correctness, etc.).
   Each operates independently, optimizing for recall — surface everything suspicious. False positives are expected.

3. **Proving** — a single agent applies adversarial falsification gates to every surfaced finding. Each finding is
   treated as a hypothesis: name what would disprove it, then check. Findings that survive all gates reach the report;
   the rest are rejected.

4. **Filing** — surviving findings are formatted into a final report with code quotes, file references, and severity
   ratings.

The pipeline is orchestrated by a stateful MCP server that enforces phase order — tools reject calls outside their valid
phase, preventing agents from skipping steps or mixing concerns.

## Usage

```
/kensai-review                        # review uncommitted changes
/kensai-review committed              # review the last commit
/kensai-review all                    # review last commit + uncommitted (amendment preview)
/kensai-review uncommitted ./src      # review uncommitted changes in a specific path
```

## Requirements

- Node.js 26+ (MCP server runtime)
- Agent teams enabled: set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in your Claude Code environment

## Installation

```
/plugin marketplace add GaijinEntertainment/yatai
/plugin install kensai
```
