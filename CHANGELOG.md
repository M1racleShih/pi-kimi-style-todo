# Changelog

## 0.1.0 — local development version (not published)

- Extract the pinned rpiv-todo 2.13.8 kernel, locales and regression tests into an independent Pi package.
- Add a compact Kimi-inspired, borderless editor-top widget with semantic theme colors, completed strikethrough and bold current work.
- Retain completed tasks by default; add truthful counts, bounded priority clipping, collapse and optional previous-turn display hiding.
- Isolate configuration and i18n namespaces while preserving the todo protocol and rpiv-todo-state session snapshots.
- Keep the effective shortcut hint stable until reload, avoid host key conflicts and leave Ctrl+T to Pi.
- Add a scrollable /todos detail view and retain RPC notifications and headless tool operation.
- Add isolated unit/SDK/resource/CLI/PTY/package-install checks and a synthetic terminal preview.
