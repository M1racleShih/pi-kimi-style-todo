/** Persistent, unfocused editor-top widget. Task state and display state are separate. */
import type { ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import { type TUI, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { COLLAPSE_KEY_OFF, getCompletedDisplay, getMaxWidgetLines } from "./config.js";
import { t } from "./state/i18n-bridge.js";
import { selectShowTaskIds } from "./state/selectors.js";
import { getRenderState } from "./state/store.js";
import { formatOverlayTaskLine } from "./view/format.js";
import { selectWidgetTasks, widgetLineBudget } from "./view/layout.js";

export const WIDGET_KEY = "pi-kimi-style-todos";

export class TodoOverlay {
  private uiCtx: ExtensionUIContext | undefined;
  private widgetRegistered = false;
  private tui: TUI | undefined;
  private completedTaskIdsPendingHide = new Set<number>();
  private hiddenCompletedTaskIds = new Set<number>();
  private lastNextId: number | undefined;
  private collapsed = false;

  // The entry point injects the binding actually registered at load time.
  constructor(private readonly collapseKey: string = COLLAPSE_KEY_OFF) {}

  setUICtx(ctx: ExtensionUIContext): void {
    if (ctx === this.uiCtx) return;
    this.uiCtx = ctx;
    this.widgetRegistered = false;
    this.tui = undefined;
    this.collapsed = false;
    this.resetCompletedDisplayState();
  }

  update(): void {
    if (!this.uiCtx) return;
    const tasks = this.getSnapshot().tasks.filter(task => task.status !== "deleted");
    if (tasks.length === 0) {
      if (this.widgetRegistered) this.uiCtx.setWidget(WIDGET_KEY, undefined);
      this.widgetRegistered = false;
      this.tui = undefined;
      this.collapsed = false;
      this.resetCompletedDisplayState();
      return;
    }
    if (!this.widgetRegistered) {
      this.uiCtx.setWidget(WIDGET_KEY, (tui, factoryTheme) => {
        this.tui = tui;
        return {
          render: (width: number) => this.renderWidget(this.uiCtx?.theme ?? factoryTheme, width),
          invalidate() { /* No cached ANSI strings; theme is read at render time. */ }
        };
      }, { placement: "aboveEditor" });
      this.widgetRegistered = true;
    } else this.tui?.requestRender();
  }

  resetCompletedDisplayState(): void {
    this.completedTaskIdsPendingHide.clear();
    this.hiddenCompletedTaskIds.clear();
    this.lastNextId = undefined;
  }

  hideCompletedTasksFromPreviousTurn(): void {
    if (getCompletedDisplay() !== "hide-previous-turn") {
      if (this.hiddenCompletedTaskIds.size) {
        this.resetCompletedDisplayState();
        this.tui?.requestRender(true);
      }
      return;
    }
    if (!this.completedTaskIdsPendingHide.size) return;
    for (const id of this.completedTaskIdsPendingHide) this.hiddenCompletedTaskIds.add(id);
    this.completedTaskIdsPendingHide.clear();
    this.tui?.requestRender(true);
  }

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.tui?.requestRender(true);
  }

  isRegistered(): boolean { return this.widgetRegistered; }

  private getSnapshot() {
    const state = getRenderState();
    if (this.lastNextId !== undefined && state.nextId < this.lastNextId) {
      this.collapsed = false;
      this.resetCompletedDisplayState();
    }
    this.lastNextId = state.nextId;
    const completed = new Set(state.tasks.filter(task => task.status === "completed").map(task => task.id));
    for (const ids of [this.completedTaskIdsPendingHide, this.hiddenCompletedTaskIds]) {
      for (const id of ids) if (!completed.has(id)) ids.delete(id);
    }
    return state;
  }

  private renderWidget(theme: Theme, width: number): string[] {
    if (width <= 0) return [];
    const snapshot = this.getSnapshot();
    const all = snapshot.tasks.filter(task => task.status !== "deleted");
    if (!all.length) return [];
    const hiding = getCompletedDisplay() === "hide-previous-turn";
    const tasks = hiding ? all.filter(task => !this.hiddenCompletedTaskIds.has(task.id)) : all;
    const hidden = all.length - tasks.length;
    const limit = widgetLineBudget(getMaxWidgetLines(), this.tui?.terminal?.rows);
    if (limit === 0) return [];
    const clip = (line: string) => truncateToWidth(line, width, "…");
    const heading = theme.fg("accent", theme.bold(t("overlay.heading", "Todo")));
    const selected = this.collapsed ? [] : selectWidgetTasks(tasks, Math.max(0, limit - 2));
    const count = this.collapsed
      ? t("overlay.summary", "{total} items · {done} completed").replace("{total}", String(tasks.length)).replace("{done}", String(tasks.filter(task => task.status === "completed").length))
      : (selected.length === tasks.length ? t("overlay.all", "all {total} items") : t("overlay.showing", "showing {shown} of {total} items"))
        .replace("{shown}", String(selected.length)).replace("{total}", String(tasks.length));
    const hiddenText = hidden ? t("overlay.hidden", "{count} completed hidden").replace("{count}", String(hidden)) : "";
    const hint = this.collapseKey === COLLAPSE_KEY_OFF ? "" :
      t(this.collapsed ? "overlay.expandHint" : "overlay.collapseHint", this.collapsed ? "{key} to expand" : "{key} to collapse").replace("{key}", this.collapseKey);
    // Preserve truthful counts before shortcut hints. At extremely narrow widths
    // use a numeric ratio rather than truncate "all N" into a misleading label.
    let summary = [count, hiddenText].filter(Boolean).join(" · ");
    if (visibleWidth(summary) > width) summary = `${selected.length}/${tasks.length}${hidden ? ` (+${hidden})` : ""}`;
    const withHint = [summary, hint].filter(Boolean).join(" · ");
    const shortHint = hint ? `${summary} · ${this.collapseKey}` : summary;
    const footer = theme.fg("muted", clip(visibleWidth(withHint) <= width ? withHint : visibleWidth(shortHint) <= width ? shortHint : summary));
    if (limit === 1) return [clip(footer)];
    const lines = [clip(heading)];
    const showIds = selectShowTaskIds({ tasks: [...all], nextId: snapshot.nextId });
    for (const task of selected) {
      lines.push(clip(formatOverlayTaskLine(task, theme, showIds)));
      // Only genuinely displayed completions are eligible on the next turn.
      if (hiding && task.status === "completed") this.completedTaskIdsPendingHide.add(task.id);
    }
    lines.push(footer);
    return lines;
  }

  dispose(): void {
    try {
      if (this.uiCtx && this.widgetRegistered) this.uiCtx.setWidget(WIDGET_KEY, undefined);
    } finally {
      this.widgetRegistered = false;
      this.tui = undefined;
      this.uiCtx = undefined;
      this.collapsed = false;
      this.resetCompletedDisplayState();
    }
  }
}
