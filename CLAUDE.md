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

**Licensing:**

- Every plugin must contain a copy of the root `LICENSE` file in its directory
- When adding a new plugin, copy `LICENSE` from the repository root into the plugin directory

</conventions>

<git-commit-config>
<extra-instructions>
Since the project is about plugins, the scope in the commit message, if defined, must not contain the ecosystem path
(`claude/` or `pi/`). Use the plugin name as the scope.
</extra-instructions>
</git-commit-config>
