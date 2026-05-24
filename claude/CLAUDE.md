# Claude Code Plugins

Claude Code plugin ecosystem. Each subdirectory is a self-contained plugin.

## Plugins

| Plugin | Purpose |
|--------|---------|
| [kensai](kensai/) | Multi-agent code review pipeline with adversarial falsification |

## Conventions

<conventions>
**Formatting:**
- Agent instruction files and prompts use the MDX parser (block-level XML tag support)
- README.md files use GFM parser

**Skill structure:**

- Router pattern: SKILL.md routes to `references/` for detailed content
- Keep SKILL.md under 500 lines; move depth to references

**Installation instructions:**

- All plugin READMEs must use marketplace commands:
  ```
  /plugin marketplace add GaijinEntertainment/yatai
  /plugin install <plugin-name>
  ```
- Do not use manual cp/ln installation methods

**Version management:**

- Plugin versions must be synchronized between each plugin's `.claude-plugin/plugin.json` and the repo-root
  `.claude-plugin/marketplace.json` (which lists all plugins in a single file)
- Update both files when bumping versions
</conventions>
