# yatai

Gaijin Entertainment plugin repository. Houses plugins for two ecosystems: Claude Code (`claude/`) and Pi (`pi/`).

## Structure

```
yatai/
├── claude/               # Claude Code plugins
│   └── kensai/           # Multi-agent code review pipeline
└── pi/                   # PI plugins (future)
```

Each ecosystem has its own instruction file (`CLAUDE.md`, `AGENTS.md`, etc.) with ecosystem-specific conventions.

## Conventions

<conventions>

**Plugin context:**

- Each plugin has an agent-facing instruction file (`CLAUDE.md`, `AGENTS.md`, etc.) explaining its components
- Each plugin has `README.md` for humans

**Plugin documentation style:**

- **Agent-facing file** — brief prose introduction, then structured content: component tables, dependency diagrams,
  bullet-list conventions. Optimize for LLM compliance — terse bullets over explanatory paragraphs.
- **README.md** — human-facing documentation. Explanatory prose that frames the plugin around the problem it solves,
  explains what each component does and when to use it.

**Documentation maintenance:** Update plugin docs in the same work session as the code change:

- **Plugin agent-facing file** — update when: adding/removing/renaming components; changing purpose, scope, or
  dependencies; adding/removing conventions
- **Plugin README.md** — update when: any change that affects what users see or install
- **Ecosystem instruction file** — update plugin table when: adding/removing a plugin
- **Root CLAUDE.md** — update structure diagram when: adding/removing a plugin or ecosystem

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

**Marketplace manifest (`marketplace.json`):**

- The `source` field in each plugin entry must be a `./`-prefixed relative path from the repo root to the plugin
  directory (e.g., `"./claude/kensai"`). Bare names or paths without `./` are interpreted as unsupported source types
- The `pluginRoot` metadata field is not honored by Claude Code — do not rely on it for path resolution

**Licensing:**

- Every plugin must contain a copy of the root `LICENSE` file in its directory
- When adding a new plugin, copy `LICENSE` from the repository root into the plugin directory

**npm packages:**

- Use `vp` for all toolchain operations — `vp install`, `vp check`, `vp test`, `vp build`. Never invoke `npm`,
  `yarn`, or bare `pnpm` commands directly in instructions or CI
- Every `package.json` must include: `license` (matching the plugin license), `author`, `repository`, `type` (`module`),
  `engines`, and `packageManager` fields
- Publishable packages must also include: `description`, `bin` or `exports`, `engines`, and `publishConfig`
- Publishable packages must have a `.npmignore` excluding tests, configs, lock files, and agent-facing docs
- Lock files (`pnpm-lock.yaml`) must be committed
- Pin `packageManager` in `package.json` to the exact pnpm version used by the project
- Use `--frozen-lockfile` in CI to catch uncommitted dependency changes

**npm supply chain protection:**

- Every package must have an `.npmrc` with `ignore-scripts=true` (blocks post-install script attacks) and
  `minimum-release-age=7d` (rejects packages published less than 7 days ago)
- All publishable packages must set `"publishConfig": { "access": "public" }` in `package.json`
- The `@gaijin` npm scope must have 2FA enforced at the org level (manual npm setting)

</conventions>

<git-commit-config>
<extra-instructions>
Since the project is about plugins, the scope in the commit message, if defined, must not contain the ecosystem path
(`claude/` or `pi/`). Use the plugin name as the scope.
</extra-instructions>
</git-commit-config>
