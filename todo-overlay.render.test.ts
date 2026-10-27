// Kimi-style UI contract (replaces upstream's deliberately different tree layout tests).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createMockUI } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it, vi } from "vitest";
import { applyLocale, registerStrings } from "@juicesharp/rpiv-i18n";
import { I18N_NAMESPACE } from "./state/i18n-bridge.js";
import { replaceState, setActiveRenderSession, getRenderState } from "./state/store.js";
import { TodoOverlay } from "./todo-overlay.js";
import type { Task } from "./tool/types.js";

function config(fields: Record<string, unknown>) {
  const dir = join(process.env.HOME!, ".config/pi-kimi-style-todo");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify(fields));
}
const task = (id: number, status: Task["status"] = "pending", subject = `task-${id}`): Task => ({ id, status, subject });
const identity = { fg: (_: string, s: string) => s, bold: (s: string) => s, strikethrough: (s: string) => s } as Theme;
function setup(tasks: Task[], key = "ctrl+shift+t", rows?: number, theme = identity) {
  setActiveRenderSession("render");
  const state = { tasks, nextId: Math.max(0, ...tasks.map(task => task.id)) + 1 };
  replaceState("render", state);
  const ui = createMockUI({ theme });
  const overlay = new TodoOverlay(key);
  overlay.setUICtx(ui as never);
  overlay.update();
  const factory = ui.setWidget.mock.calls[0]?.[1];
  const tui = { requestRender: vi.fn(), terminal: { rows } };
  const widget = factory?.(tui, theme);
  return { overlay, ui, tui, widget, state, render: (width = 200): string[] => widget?.render(width) ?? [] };
}

describe("compact Kimi-style layout", () => {
  it("renders exact title, three glyphs, original order, truthful footer and no tree/border/spacer", () => {
    const { render } = setup([task(1, "completed"), task(2, "in_progress"), task(3)]);
    expect(render()).toEqual(["Todo", "✓ task-1", "● task-2", "○ task-3", "all 3 items · ctrl+shift+t to collapse"]);
    expect(render().join("\n")).not.toMatch(/[├└│─]/);
  });
  it("styles completed green+muted+strike, current accent+bold text, pending dim glyph", () => {
    const theme = {
      fg: (c: string, s: string) => `<${c}>${s}</${c}>`,
      bold: (s: string) => `<b>${s}</b>`, strikethrough: (s: string) => `<s>${s}</s>`
    } as Theme;
    const out = setup([task(1, "completed"), task(2, "in_progress"), task(3)], "off", undefined, theme).render(500);
    expect(out[0]).toBe("<accent><b>Todo</b></accent>");
    expect(out[1]).toBe("<success>✓</success> <s><muted>task-1</muted></s>");
    expect(out[2]).toBe("<accent>●</accent> <b><text>task-2</text></b>");
    expect(out[3]).toBe("<dim>○</dim> <text>task-3</text>");
  });
  it("omits deleted tombstones and unneeded ids, activeForm and metadata", () => {
    const { render } = setup([{ ...task(1, "in_progress"), activeForm: "Working", description: "private detail", owner: "owner" }, task(2, "deleted")]);
    expect(render().join("\n")).not.toMatch(/#1|Working|private detail|owner|task-2/);
  });
  it("shows ids and dependency hints only when they provide context", () => {
    const { render } = setup([task(1), { ...task(2), blockedBy: [1] }]);
    expect(render()[1]).toContain("#1");
    expect(render()[2]).toContain("#2 task-2 ⛓ #1");
  });
  it("unmounts for empty and tombstone-only lists; default retains all-completed lists", () => {
    expect(setup([]).ui.setWidget).not.toHaveBeenCalled();
    expect(setup([task(1, "deleted")]).ui.setWidget).not.toHaveBeenCalled();
    const { overlay, render } = setup([task(1, "completed")]);
    render(); overlay.hideCompletedTasksFromPreviousTurn();
    expect(render()[1]).toBe("✓ task-1");
  });
});

describe("height budget and priority without task mutation", () => {
  it("counts title/footer, displays all at exact budget and truncates at one over", () => {
    config({ maxWidgetLines: 4 });
    expect(setup([task(1), task(2)]).render()).toHaveLength(4);
    expect(setup([task(1), task(2), task(3)]).render()).toEqual(["Todo", "○ task-1", "○ task-2", "showing 2 of 3 items · ctrl+shift+t to collapse"]);
  });
  it("prioritizes late current tasks, then pending, then completed; preserves original order", () => {
    config({ maxWidgetLines: 5 });
    const { render, state } = setup([task(1, "completed"), task(2), task(3), task(4), task(5, "in_progress")]);
    const before = JSON.stringify(state);
    expect(render()).toEqual(["Todo", "○ task-2", "○ task-3", "● task-5", "showing 3 of 5 items · ctrl+shift+t to collapse"]);
    expect(JSON.stringify(getRenderState())).toBe(before);
  });
  it("deterministically clips excessive in_progress tasks without enforcing a new state rule", () => {
    config({ maxWidgetLines: 3 });
    expect(setup([task(1), task(2, "in_progress"), task(3, "in_progress")]).render()).toEqual(["Todo", "● task-2", "showing 1 of 3 items · ctrl+shift+t to collapse"]);
  });
  it("respects short terminals and resizes; never expands unbounded with Ctrl+O", () => {
    config({ maxWidgetLines: 1000 });
    const { render, tui, ui } = setup(Array.from({ length: 200 }, (_, i) => task(i + 1)), "off", 24);
    expect(render()).toHaveLength(10);
    Object.assign(ui, { getToolsExpanded: () => true });
    expect(render()).toHaveLength(10);
    tui.terminal.rows = 12;
    expect(render()).toHaveLength(4);
    tui.terminal.rows = 6;
    expect(render()).toHaveLength(1);
    tui.terminal.rows = 4;
    expect(render()).toEqual([]);
  });
});

describe("display-only completion hiding", () => {
  it("hides only actually displayed completions, explicitly counts hidden, and retains canonical state", () => {
    config({ maxWidgetLines: 4, completedDisplay: "hide-previous-turn" });
    const { render, overlay, state } = setup([task(1, "completed"), task(2, "completed"), task(3, "completed")]);
    expect(render().join("\n")).toContain("showing 2 of 3");
    overlay.hideCompletedTasksFromPreviousTurn();
    expect(render()).toEqual(["Todo", "✓ task-3", "all 1 items · 2 completed hidden · ctrl+shift+t to collapse"]);
    expect(getRenderState()).toBe(state);
    overlay.hideCompletedTasksFromPreviousTurn();
    expect(render().at(-1)).toContain("all 0 items · 3 completed hidden");
    config({ completedDisplay: "retain" });
    expect(render()).toContain("✓ task-1");
  });
  it("does not queue completions while collapsed; reload/reset shows them again", () => {
    config({ completedDisplay: "hide-previous-turn" });
    const { render, overlay } = setup([task(1, "completed")]);
    overlay.toggleCollapse(); render(); overlay.hideCompletedTasksFromPreviousTurn(); overlay.toggleCollapse();
    expect(render()).toContain("✓ task-1");
    overlay.hideCompletedTasksFromPreviousTurn();
    overlay.resetCompletedDisplayState();
    expect(render()).toContain("✓ task-1");
  });
});

describe("collapse, theme invalidation and terminal text", () => {
  it("localizes the same live widget without storing translated text in task state", () => {
    registerStrings(I18N_NAMESPACE, { en: { "overlay.heading": "Todo", "overlay.all": "all {total} items" }, zh: { "overlay.heading": "Todo", "overlay.all": "共 {total} 项" } });
    const { render, ui } = setup([task(1)]);
    applyLocale("zh"); expect(render().at(-1)).toContain("共 1 项");
    applyLocale("en"); expect(render().at(-1)).toContain("all 1 items");
    expect(ui.setWidget).toHaveBeenCalledTimes(1);
  });
  it("collapses to two lines, uses the bound key not edited config, and has an off path", () => {
    const { overlay, render, tui } = setup([task(1)], "alt+o");
    overlay.toggleCollapse();
    config({ collapseKey: "off" });
    expect(render()).toEqual(["Todo", "1 items · 0 completed · alt+o to expand"]);
    expect(tui.requestRender).toHaveBeenCalledWith(true);
    expect(setup([task(1)], "off").render().at(-1)).toBe("all 1 items");
  });
  it("rebuilds with the current theme after invalidate and resets collapse on new UI", () => {
    const { overlay, render, widget, ui } = setup([task(1)]);
    Object.assign(ui, { theme: { ...identity, fg: (_: string, s: string) => `\x1b[31m${s}\x1b[39m` } });
    widget.invalidate();
    expect(render()[0]).toContain("\x1b[31m");
    overlay.toggleCollapse();
    const replacement = createMockUI({ theme: identity });
    overlay.setUICtx(replacement as never); overlay.update();
    const next = replacement.setWidget.mock.calls[0][1]({ requestRender() {} }, identity);
    expect(next.render(200)).toContain("○ task-1");
  });
  it("sanitizes control sequences and fits Unicode, emoji and combining characters at every width", () => {
    const { render } = setup([task(1, "in_progress", "中文 👨‍👩‍👧‍👦 e\u0301 👍🏽 long\x1b[2J\x1b]0;bad\x07\nend\u202e")]);
    for (let width = 0; width <= 100; width++) {
      const lines = render(width);
      for (const line of lines) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
        expect(line.replace(/\x1b\[[0-9;]*m/g, "")).not.toMatch(/\x1b|\n|\u202e|bad/);
      }
    }
    expect(render().join("\n")).toContain("中文");
    expect(render(12).at(-1)?.replace(/\x1b\[[0-9;]*m/g, "")).toBe("all 1 items");
    expect(render(8).at(-1)?.replace(/\x1b\[[0-9;]*m/g, "")).toBe("1/1");
  });
});
