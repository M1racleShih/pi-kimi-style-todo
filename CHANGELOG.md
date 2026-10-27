# Changelog

## 0.1.0

- Refresh the task kernel to pinned rpiv-todo 2.15.0: atomic tasks[] batch creation, per-item fields/dependencies, pre-validation decoding of double-encoded batch arguments, and malformed-snapshot fallback without changing persistence identifiers.
- Preserve byte-for-byte kernel source and per-file provenance; verify all 11 kernel hashes during packaging. Keep the independent Kimi-style display and stable historical IDs.
- Validate batch calls in registered-tool, real codemode replay, CLI and PTY scenarios; move the pinned Pi development/verification baseline to 1.4.0.
- Show validation and host execution failures with their reason and error styling instead of a success/status echo, in both collapsed and expanded output.
- Render update/get/delete call labels from stable task IDs rather than current foreground subjects, preventing historical calls from changing after clear, replay or ID reuse.
- Detect shared terminal input sequences such as Ctrl+I/Tab and Ctrl+M/Enter before registering the collapse shortcut; preserve free modified bindings.
- Add registered-tool and shortcut regressions plus real regular/fullscreen terminal checks for errors, historical labels, Tab completion and Enter submission.
- Extract selected rpiv-todo source, locales and regression tests into an independent Pi package, retaining the initial 2.13.8 provenance and the refreshed 2.15.0 task kernel.
- Add a compact Kimi-inspired, borderless editor-top widget with semantic theme colors, completed strikethrough and bold current work.
- Retain completed tasks by default; add truthful counts, bounded priority clipping, collapse and optional previous-turn display hiding.
- Isolate configuration and i18n namespaces while preserving the todo protocol and rpiv-todo-state session snapshots.
- Keep the effective shortcut hint stable until reload, avoid host key conflicts and leave Ctrl+T to Pi.
- Add a scrollable /todos detail view and retain RPC notifications and headless tool operation.
- Add isolated unit/SDK/resource/CLI/PTY/package-install checks and a synthetic terminal preview.
