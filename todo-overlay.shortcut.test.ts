import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getKeybindings, isKittyProtocolActive, type KeyId, KeybindingsManager, matchesKey, setKeybindings, setKittyProtocolActive } from "@earendil-works/pi-tui";
import { createMockCtx, createMockPi, makeTheme } from "@juicesharp/rpiv-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import registerTodo from "./index.js";

const original = getKeybindings();
const originalKitty = isKittyProtocolActive();
afterEach(() => { setKeybindings(original); setKittyProtocolActive(originalKitty); });
function config(key: string) {
  const dir = join(process.env.HOME!, ".config/pi-kimi-style-todo");
  mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "config.json"), JSON.stringify({ collapseKey: key }));
}
async function setup(mode = "tui") {
  const { pi, captured } = createMockPi(); registerTodo(pi);
  const ctx = createMockCtx({ sessionId: "front", hasUI: mode === "tui" || mode === "rpc", mode });
  const start = captured.events.get("session_start")![0];
  const end = captured.events.get("tool_execution_end")![0];
  await start({}, ctx);
  return { captured, ctx, start, end, async seed() {
    await captured.tools.get("todo")!.execute("tc", { action: "create", subject: "a" } as never, undefined, undefined, ctx);
    await end({ toolName: "todo", isError: false }, ctx);
  } };
}
describe("shortcut effective binding", () => {
  it("registers exactly once at TUI session_start, not during resource discovery", async () => {
    const { pi, captured } = createMockPi(); registerTodo(pi);
    expect(captured.shortcuts.size).toBe(0);
    const ctx = createMockCtx({ hasUI: true });
    await captured.events.get("session_start")![0]({}, ctx);
    await captured.events.get("session_start")![0]({}, ctx);
    expect(captured.shortcuts.size).toBe(1);
    expect(captured.shortcuts.get("ctrl+shift+t")!.description).toContain("Collapse");
    expect(captured.shortcuts.has("ctrl+t")).toBe(false);
  });
  it.each(["rpc", "print", "json"])("never registers or renders in %s mode", async mode => {
    const { captured, ctx, seed } = await setup(mode); await seed();
    expect(captured.shortcuts.size).toBe(0);
    expect(ctx.ui.setWidget).not.toHaveBeenCalled();
  });
  it.each([["alt+o", "alt+o"], ["ctr+t", "ctrl+shift+t"], ["off", undefined]])("resolves %s to %s", async (raw, effective) => {
    config(raw!); const { captured } = await setup();
    expect([...captured.shortcuts.keys()]).toEqual(effective ? [effective] : []);
  });
  it("refreshes the host manager before resolving conflicts during reload", async () => {
    config("alt+o");
    const manager = new KeybindingsManager({ "app.thinking.toggle": { defaultKeys: "ctrl+t" } });
    const reload = vi.fn(() => manager.setUserBindings({ "app.thinking.toggle": "alt+o" }));
    Object.assign(manager, { reload }); setKeybindings(manager);
    const { captured, ctx } = await setup();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(captured.shortcuts.size).toBe(0);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("app.thinking.toggle"), "warning");
  });
  it("disables host conflicts, including aliases/modifier order, and explains how to fix them", async () => {
    config("ctrl+t");
    setKeybindings(new KeybindingsManager({ "app.thinking.toggle": { defaultKeys: "ctrl+t" } }));
    const { captured, ctx, seed } = await setup(); await seed();
    expect(captured.shortcuts.size).toBe(0);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("app.thinking.toggle"), "warning");
    const f = (ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(f({ requestRender() {} }, makeTheme()).render(200).join("\n")).not.toContain("to collapse");
    config("shift+ctrl+t");
    setKeybindings(new KeybindingsManager({ "app.session.tree": { defaultKeys: "ctrl+shift+t" } }));
    expect((await setup()).captured.shortcuts.size).toBe(0);
  });
  it("does not steal the host's Tab through the equivalent ctrl+i input", async () => {
    config("ctrl+i");
    setKeybindings(new KeybindingsManager({ "tui.input.tab": { defaultKeys: "tab" } }));
    expect(matchesKey("\t", "tab")).toBe(true);
    expect(matchesKey("\t", "ctrl+i")).toBe(true);
    const { captured, ctx, seed } = await setup();
    expect(captured.shortcuts.size).toBe(0); // Tab must also work before any widget exists.
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("tui.input.tab"), "warning");
    await seed();
    const factory = (ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(factory({ requestRender() {} }, makeTheme()).render(200).at(-1)).toBe("all 1 items");
  });
  describe.each([false, true])("terminal aliases (Kitty=%s)", kitty => {
    it.each([
      ["ctrl+m", "enter", "\r"], ["ctrl+m", "return", "\r"],
      ["ctrl+[", "escape", "\x1b"], ["ctrl+[", "esc", "\x1b"],
      ["tab", "ctrl+i", "\t"], ["enter", "ctrl+m", "\r"],
    ])("disables %s when host %s consumes the same input", async (requested, host, input) => {
      setKittyProtocolActive(kitty);
      config(requested);
      setKeybindings(new KeybindingsManager({ "fixture.host": { defaultKeys: host as KeyId } }));
      expect(matchesKey(input, requested as KeyId)).toBe(true);
      expect(matchesKey(input, host as KeyId)).toBe(true);
      const { captured, ctx } = await setup();
      expect(captured.shortcuts.size).toBe(0);
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("fixture.host"), "warning");
    });
  });
  it("detects legacy Alt-prefixed aliases without a duplicate alias table", async () => {
    setKittyProtocolActive(false);
    config("alt+b");
    setKeybindings(new KeybindingsManager({ "tui.editor.cursorWordLeft": { defaultKeys: "alt+left" } }));
    expect(matchesKey("\x1bb", "alt+b")).toBe(true);
    expect(matchesKey("\x1bb", "alt+left")).toBe(true);
    const { captured, ctx } = await setup();
    expect(captured.shortcuts.size).toBe(0);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("tui.editor.cursorWordLeft"), "warning");
  });
  it("allows an alias when the host binding is explicitly disabled", async () => {
    config("ctrl+i");
    setKeybindings(new KeybindingsManager({ "tui.input.tab": { defaultKeys: [] } }));
    const { captured, ctx } = await setup();
    expect([...captured.shortcuts.keys()]).toEqual(["ctrl+i"]);
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });
  it.each([["ctrl+shift+i", "tab"], ["ctrl+shift+m", "enter"], ["ctrl+shift+t", "ctrl+t"], ["super+i", "tab"]])("keeps distinct modified binding %s available alongside %s", async (requested, host) => {
    config(requested);
    setKeybindings(new KeybindingsManager({ "fixture.host": { defaultKeys: host as KeyId } }));
    const { captured, ctx } = await setup();
    expect([...captured.shortcuts.keys()]).toEqual([requested]);
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });
  it("toggles without re-registering, retains bound hint until reload, guards wrong sessions/modes", async () => {
    const { captured, ctx, seed } = await setup();
    const shortcut = captured.shortcuts.get("ctrl+shift+t")!;
    await shortcut.handler(ctx); // no tasks yet
    await seed();
    const setWidget = ctx.ui.setWidget as ReturnType<typeof vi.fn>;
    const requestRender = vi.fn();
    const widget = setWidget.mock.calls[0][1]({ requestRender }, makeTheme());
    await shortcut.handler(createMockCtx({ hasUI: true, mode: "rpc" }));
    await shortcut.handler(createMockCtx({ hasUI: true, sessionId: "child" }));
    expect(widget.render(200)).toContain("○ a");
    config("alt+o"); await shortcut.handler(ctx);
    expect(requestRender).toHaveBeenCalledWith(true);
    expect(widget.render(200).at(-1)).toContain("ctrl+shift+t to expand");
    await shortcut.handler(ctx); expect(widget.render(200)).toContain("○ a");
    expect(setWidget).toHaveBeenCalledTimes(1);
    const reloaded = await setup();
    expect(reloaded.captured.shortcuts.has("alt+o")).toBe(true);
  });
});
