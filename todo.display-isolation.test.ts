import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createMockCtx, createMockPi, makeTheme } from "@juicesharp/rpiv-test-utils";
import { expect, it, vi } from "vitest";
import registerTodo from "./index.js";

it("keeps completion visibility foreground-local and resets reused ids after batched clear", async () => {
  const dir = join(process.env.HOME!, ".config/pi-kimi-style-todo");
  mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "config.json"), '{"completedDisplay":"hide-previous-turn"}');
  const { pi, captured } = createMockPi(); registerTodo(pi);
  const parent = createMockCtx({ hasUI: true, sessionId: "parent" });
  const child = createMockCtx({ hasUI: true, sessionId: "child" });
  const event = async (name: string, data: unknown, ctx = parent) => captured.events.get(name)![0](data, ctx);
  const call = (args: unknown) => captured.tools.get("todo")!.execute("tc", args as never, undefined, undefined, parent);
  await event("session_start", {});
  await call({ action: "create", subject: "same id" });
  const completed = await call({ action: "update", id: 1, status: "completed" });
  await event("tool_execution_end", { toolName: "todo", result: completed, isError: false });
  const factory = (parent.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls[0][1];
  const widget = factory({ requestRender: vi.fn() }, makeTheme());
  expect(widget.render(200).join("\n")).toContain("✓ same id");
  await event("agent_start", {}, child);
  expect(widget.render(200).join("\n")).toContain("✓ same id");
  await event("agent_start", {});
  expect(widget.render(200).join("\n")).toContain("1 completed hidden");
  const cleared = await call({ action: "clear" });
  await call({ action: "create", subject: "same id" });
  await call({ action: "update", id: 1, status: "completed" });
  // Clear's event arrives after ids were reused; nextId alone cannot detect this.
  await event("tool_execution_end", { toolName: "todo", result: cleared, isError: false });
  expect(widget.render(200).join("\n")).toContain("✓ same id");
});
