# Third-party notices

## rpiv-todo and test helpers

This extension derives from the MIT-licensed work of juicesharp:

- Current task kernel: `@juicesharp/rpiv-todo@2.15.0`
- Initial extraction: `@juicesharp/rpiv-todo@2.13.8`
- Repository: <https://github.com/juicesharp/rpiv-mono>
- Source directory: `packages/rpiv-todo`
- Current kernel commit: `ce6d3530410812ca504ec294995581a52170f9e1`
- Initial extraction commit: `afc21bc25f7d07cae9fb3103dc309240a16b9f49`
- Original notice: `Copyright (c) 2026 juicesharp`
- Complete original license: [licenses/rpiv-todo-MIT.txt](licenses/rpiv-todo-MIT.txt)

The initial runtime TypeScript, locale JSON, regression tests and selected Pi/UI/session/theme test helpers were imported from the initial extraction commit. The task kernel, reducer/replay/envelope suites, argument normalizer and relevant registration/rendering changes were refreshed from the current kernel commit. Test helpers live in `.test/`, outside the distribution. No upstream Git history, promotional images or whole monorepo were imported.

[UPSTREAM.json](UPSTREAM.json) records original paths, per-file commits and SHA-256 values **before local adaptation**. Entries without an explicit commit use `importStatus.defaultCommit`. All 11 listed kernel files (task reducer, graph, store, replay, schema, sanitization, response envelope and argument normalizer) are byte-for-byte copies from the current kernel commit, including its `.ts` import paths; packaging checks their hashes. Local changes cover packaging, independent namespaces, compact display, optional completion visibility, effective shortcut handling, TUI-only lifecycle work and the detailed `/todos` view. UI tests were revised to assert the new design; protocol and state regression suites remain.

The repository's [MIT license](LICENSE) for original contributions does not replace the upstream notice. Both full licenses are distributed.

## Dependencies

`@juicesharp/rpiv-config@2.13.8` is a runtime dependency; `@juicesharp/rpiv-i18n` is optional. Their license files remain in their own packages. Pi's host-provided modules are peers, not bundled runtime dependencies.

## Names and previews

This is an independent community project. No endorsement by juicesharp, Pi, Kimi or Moonshot AI is implied. Third-party names and marks remain with their respective owners.

The public preview is reconstructed from this extension's actual Pi PTY output using project-created synthetic tasks. It contains no private reference image, brand logo, user session or real task data.
