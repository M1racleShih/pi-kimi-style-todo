import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createMockCtx, createMockPi, makeTheme } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it, vi } from "vitest";
import { registerTodosCommand } from "../todo.js";
import { replaceState } from "../state/store.js";
import { taskDetailLines, TodoListView } from "./todo-list.js";

const theme = makeTheme() as Theme;
describe("/todos detailed viewer", () => {
  it("preserves description, activeForm, owner, metadata and reverse dependencies safely", () => {
    const a = { id: 1, status: "pending" as const, subject: "a", description: "hello\x1b[2J", owner: "Alice", activeForm: "Working", metadata: { sample: 1 } };
    const state = { tasks: [a, { id: 2, status: "pending" as const, subject: "b", blockedBy: [1] }], nextId: 3 };
    expect(taskDetailLines(a, state)).toEqual(["    description: hello", "    activeForm: Working", "    owner: Alice", "    blocks: #2", '    metadata: {"sample":1}']);
  });
  it("scrolls to all rows, closes on ESC and adapts to width/height without overflow", () => {
    let rows = 24;
    const close = vi.fn(); const request = vi.fn();
    const view = new TodoListView(Array.from({ length: 100 }, (_, i) => `row-${i} 中文 👋`).join("\n"), () => theme, () => rows, request, close);
    expect(view.render(80)).toHaveLength(20);
    view.handleInput("\x1b[F"); // End
    expect(view.render(80).join("\n")).toContain("row-99");
    view.handleInput("\x1b[H"); // Home
    expect(view.render(80).join("\n")).toContain("row-0");
    view.handleInput("\x1b[6~"); // PageDown
    expect(request).toHaveBeenCalled();
    rows = 10;
    for (const width of [1, 5, 20, 80]) {
      const lines = view.render(width); expect(lines.length).toBeLessThanOrEqual(6);
      for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
    view.handleInput("\x1b"); expect(close).toHaveBeenCalledTimes(1);
  });
  it("uses custom UI only in TUI, not in RPC", async () => {
    const { pi, captured } = createMockPi(); registerTodosCommand(pi);
    const ctx = createMockCtx({ hasUI: true });
    replaceState("test-session", { tasks: [{ id: 1, subject: "fixture", status: "pending" }], nextId: 2 });
    const custom = vi.fn(async (factory: Function) => {
      const view = factory({ terminal: { rows: 24 }, requestRender() {} }, theme, {}, () => {});
      expect(view.render(80).join("\n")).toContain("fixture");
    });
    Object.assign(ctx.ui, { custom });
    await captured.commands.get("todos")!.handler("", ctx as never);
    expect(custom).toHaveBeenCalledTimes(1); expect(ctx.ui.notify).not.toHaveBeenCalled();
    await captured.commands.get("todos")!.handler("", { ...ctx, mode: "rpc" } as never);
    expect(custom).toHaveBeenCalledTimes(1); expect(ctx.ui.notify).toHaveBeenCalledTimes(1);
  });
});
