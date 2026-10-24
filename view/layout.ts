import type { Task } from "../tool/types.js";

/** Select by priority, then restore original ordering. This never changes task state. */
export function selectWidgetTasks(tasks: readonly Task[], budget: number): readonly Task[] {
  const slots = Math.max(0, Math.floor(budget));
  if (tasks.length <= slots) return tasks;
  const chosen = new Set<Task>();
  for (const status of ["in_progress", "pending", "completed"] as const) {
    for (const task of tasks) {
      if (chosen.size >= slots) break;
      if (task.status === status) chosen.add(task);
    }
  }
  return tasks.filter(task => chosen.has(task));
}

/** Leave room for the editor, status/footer and transcript even in short terminals.
 * Ctrl+O only expands tool output, not the persistent widget. */
export function widgetLineBudget(configured: number, terminalRows?: number): number {
  if (terminalRows === undefined || !Number.isFinite(terminalRows)) return configured;
  return Math.min(configured, Math.max(0, Math.floor(terminalRows / 2) - 2));
}
