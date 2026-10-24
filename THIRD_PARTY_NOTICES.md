# Third-party notices

## rpiv-todo and test helpers

This extension derives from the MIT-licensed work of juicesharp:

- Project: `@juicesharp/rpiv-todo@2.13.8`
- Repository: <https://github.com/juicesharp/rpiv-mono>
- Source directory: `packages/rpiv-todo`
- Source commit: `afc21bc25f7d07cae9fb3103dc309240a16b9f49`
- Original notice: `Copyright (c) 2026 juicesharp`
- Complete original license: [licenses/rpiv-todo-MIT.txt](licenses/rpiv-todo-MIT.txt)

The selected runtime TypeScript, locale JSON and regression tests were imported from this fixed commit. The selected Pi/UI/session/theme test helpers come from `packages/test-utils` at the same commit and live in `.test/`, outside the distribution. No upstream Git history, promotional images or whole monorepo were imported.

[UPSTREAM.json](UPSTREAM.json) records original paths and SHA-256 values **before local adaptation**. The task reducer, graph, store, replay, schema, sanitization and response envelope retain their upstream implementation. Local changes cover packaging, independent namespaces, compact display, optional completion visibility, effective shortcut handling, TUI-only lifecycle work and the detailed `/todos` view. UI tests were revised to assert the new design; protocol and state regression suites remain.

The repository's [MIT license](LICENSE) for original contributions does not replace the upstream notice. Both full licenses are distributed.

## Dependencies

`@juicesharp/rpiv-config@2.13.8` is a runtime dependency; `@juicesharp/rpiv-i18n` is optional. Their license files remain in their own packages. Pi's host-provided modules are peers, not bundled runtime dependencies.

## Names and previews

This is an independent community project. No endorsement by juicesharp, Pi, Kimi or Moonshot AI is implied. Third-party names and marks remain with their respective owners.

The public preview is reconstructed from this extension's actual Pi PTY output using project-created synthetic tasks. It contains no private reference image, brand logo, user session or real task data.
