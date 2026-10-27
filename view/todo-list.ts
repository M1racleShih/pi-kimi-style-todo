import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { TaskState } from "../state/state.js";
import { deriveBlocks } from "../state/task-graph.js";
import { sanitizeTerminalText } from "../tool/sanitize.js";
import type { Task } from "../tool/types.js";

/** Detailed text stays separate from the compact widget and from tool envelopes. */
export function taskDetailLines(task: Task, state: TaskState): string[] {
  const lines: string[] = [];
  for (const name of ["description", "activeForm", "owner"] as const) {
    if (task[name]) lines.push(`    ${name}: ${sanitizeTerminalText(task[name])}`);
  }
  const blocks = deriveBlocks(state.tasks).get(task.id);
  if (blocks?.length) lines.push(`    blocks: ${blocks.map(id => `#${id}`).join(", ")}`);
  if (task.metadata && Object.keys(task.metadata).length) lines.push(`    metadata: ${sanitizeTerminalText(JSON.stringify(task.metadata))}`);
  return lines;
}

/** Bounded, keyboard-scrollable /todos view. The persistent widget never takes focus. */
export class TodoListView {
  private offset = 0;
  private pageSize = 1;
  private maxOffset = 0;
  constructor(
    private readonly text: string,
    private readonly getTheme: () => Theme,
    private readonly getRows: () => number,
    private readonly requestRender: () => void,
    private readonly close: () => void
  ) {}

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) { this.close(); return; }
    if (matchesKey(data, "down")) this.offset++;
    else if (matchesKey(data, "up")) this.offset--;
    else if (matchesKey(data, "pageDown") || data === " ") this.offset += this.pageSize;
    else if (matchesKey(data, "pageUp")) this.offset -= this.pageSize;
    else if (matchesKey(data, "home")) this.offset = 0;
    else if (matchesKey(data, "end")) this.offset = this.maxOffset;
    else return;
    this.offset = Math.max(0, Math.min(this.maxOffset, this.offset));
    this.requestRender();
  }

  render(width: number): string[] {
    if (width <= 0) return [];
    const theme = this.getTheme();
    const rows = Math.max(1, this.getRows() - 4);
    this.pageSize = Math.max(1, rows - 2);
    const content = wrapTextWithAnsi(this.text, width).map(line => truncateToWidth(line, width, "…"));
    this.maxOffset = Math.max(0, content.length - this.pageSize);
    this.offset = Math.min(this.offset, this.maxOffset);
    const footer = `${this.offset + 1}–${Math.min(content.length, this.offset + this.pageSize)}/${content.length} · ↑/↓ PgUp/PgDn · Esc to close`;
    const lines = [theme.fg("accent", theme.bold("Todo · details")), ...content.slice(this.offset, this.offset + this.pageSize), theme.fg("muted", footer)];
    return lines.slice(0, rows).map(line => truncateToWidth(line, width, "…"));
  }
  invalidate(): void { /* Render reads the live theme and dimensions. */ }
}
