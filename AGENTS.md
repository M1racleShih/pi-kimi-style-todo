# Working on pi-kimi-style-todo

## Current boundary

- This is a documentation-only bootstrap, not a working or published extension. Do not claim implementation or test success before evidence exists.
- Keep planning, task tracking, design decisions, handoffs and process artifacts out of this repository. User documentation, source provenance, licenses, tests and public contributor rules belong here.
- If the sibling `../pi-kimi-style-todo-planning` checkout is available, read its `AGENTS.md`, `README.md`, `PLANNING.md` and `docs/handoff.md` before development. Do not copy its private content into this public repository. Its absence must never prevent building or using the extension.

## Source and compatibility

- Read `UPSTREAM.json`, `THIRD_PARTY_NOTICES.md` and the licenses before importing upstream files. Import from the recorded commit, not floating `main` or this machine's installed packages.
- Preserve upstream copyright notices and record which source and tests were imported. Do not copy the monorepo wholesale.
- Preserve the `todo` protocol and existing session replay behavior unless an explicit, tested compatibility decision says otherwise. Renaming the package must not silently invalidate persisted task state.
- The derivative and original TODO extensions must not be enabled together. Do not register duplicate tools or silently take over Pi shortcuts such as `Ctrl+T`.
- Keep rendering separate from task state. Headless operation must not depend on terminal UI.

## Safety and validation

- Do not modify the native Pi directory, cooking-pi, or original extension worktrees during development. Use disposable HOME, XDG, agent and workspace directories for tests; preserve the caller's working directory.
- Never import credentials, real sessions, account profiles, private endpoints, caches, backups, generated skills or unchecked logs.
- Pin runtime dependencies and development tools, commit the lockfile, and install with lifecycle scripts disabled. Host-provided Pi packages belong in peer dependencies, not bundled runtime dependencies.
- Runtime changes require meaningful unit tests, resource-load checks and real terminal checks, including both regular and fullscreen modes. Fixtures must be synthetic and must not contact providers or read production data.
- Do not invent verification commands: this bootstrap intentionally has no package manifest or test scripts. Establish and document them when the implementation is imported.
- Do not spawn other agents, publish npm packages, create release tags or change other repositories without explicit human authorization for that action.
