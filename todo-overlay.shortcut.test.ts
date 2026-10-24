import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getKeybindings, KeybindingsManager, setKeybindings } from "@earendil-works/pi-tui";
import { createMockCtx, createMockPi, makeTheme } from "@juicesharp/rpiv-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import registerTodo from "./index.js";

const original = getKeybindings();
afterEach(() => setKeybindings(original));
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
