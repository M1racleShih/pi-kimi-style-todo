import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { createMockCtx, createMockPi, makeTheme } from "@juicesharp/rpiv-test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetState, registerTodoTool, setActiveRenderSession, type TaskDetails, TOOL_NAME } from "./todo.js";
import { STATE_ENTRY_TYPE } from "./tool/types.js";

const theme = makeTheme() as unknown as Theme;

function setup() {
	__resetState();
	setActiveRenderSession("test-session");
	const { pi, captured } = createMockPi();
	registerTodoTool(pi);
	const tool = captured.tools.get(TOOL_NAME);
	if (!tool) throw new Error("tool not registered");
	return { tool, captured };
}

async function call(tool: ReturnType<typeof setup>["tool"], params: Record<string, unknown>) {
	return tool.execute?.("tc", params as never, undefined as never, undefined as never, createMockCtx() as never);
}

beforeEach(() => {
	__resetState();
});
afterEach(() => {
	__resetState();
});

describe("registerTodoTool — registration shape", () => {
	it("registers under the tool name 'todo' with the expected label and guidelines", () => {
		const { captured } = setup();
		const tool = captured.tools.get("todo")!;
		expect(tool.name).toBe("todo");
		expect(tool.label).toBe("Todo");
		expect(tool.promptSnippet).toContain("task list");
		expect(Array.isArray(tool.promptGuidelines)).toBe(true);
		expect((tool.promptGuidelines as string[]).length).toBeGreaterThan(0);
	});

	it("normalizes encoded batches and items before validation", async () => {
		const { tool } = setup();
		const raw = { action: "create", tasks: JSON.stringify([JSON.stringify({ subject: "Encoded task" })]) };
		const prepared = tool.prepareArguments?.(raw);
		expect(prepared).toEqual({ action: "create", tasks: [{ subject: "Encoded task" }] });
		expect((await call(tool, prepared as Record<string, unknown>))?.content).toEqual([
			{ type: "text", text: "Created #1: Encoded task (pending)" },
		]);
	});

	it("exposes a typebox parameters schema declaring the six actions", () => {
		const { tool } = setup();
		const raw = JSON.stringify(tool.parameters);
		for (const action of ["create", "update", "list", "get", "delete", "clear"]) {
			expect(raw).toContain(action);
		}
		expect(tool.parameters).toMatchObject({ properties: { tasks: { items: { required: ["subject"] } } } });
		expect(tool.description).toContain("tasks[]");
		expect(tool.promptGuidelines?.join("\n")).toContain("tasks: [{subject}, ...]");
	});
});

describe("registerTodoTool — execute mutates module state", () => {
	it("creates and persists an independent batch in one call", async () => {
		const { tool, captured } = setup();
		const params = { action: "create", tasks: [{ subject: "Inspect implementation" }, { subject: "Verify compatibility", owner: "fixture" }] };
		const result = await call(tool, params);
		expect(result?.content).toEqual([{ type: "text", text: "Created #1: Inspect implementation (pending)\nCreated #2: Verify compatibility (pending)" }]);
		expect(result?.details).toEqual({
			action: "create", params, nextId: 3,
			tasks: [
				{ id: 1, subject: "Inspect implementation", status: "pending" },
				{ id: 2, subject: "Verify compatibility", status: "pending", owner: "fixture" },
			],
		});
		expect(captured.entries).toEqual([{ customType: STATE_ENTRY_TYPE, data: result?.details }]);
		expect((await call(tool, { action: "list" }))?.content).toEqual([{ type: "text", text: "[pending] #1 Inspect implementation\n[pending] #2 Verify compatibility" }]);
	});

	it("create → list returns the seeded row", async () => {
		const { tool } = setup();
		const r1 = await call(tool, { action: "create", subject: "first" });
		expect((r1!.details as TaskDetails).action).toBe("create");
		const r2 = await call(tool, { action: "list" });
		expect(r2?.content[0]).toMatchObject({ text: expect.stringContaining("first") });
	});

	it("does not persist or consume ids when a later batch item is invalid", async () => {
		const { tool, captured } = setup();
		await call(tool, { action: "create", subject: "Root" });
		const result = await call(tool, { action: "create", tasks: [
			{ subject: "Valid leaf", blockedBy: [1] }, { subject: "Invalid leaf", blockedBy: [99] },
		] });
		expect(result?.details).toMatchObject({
			error: "blockedBy: #99 not found", nextId: 2,
			tasks: [{ id: 1, subject: "Root", status: "pending" }],
		});
		expect(captured.entries).toHaveLength(1);
		expect((await call(tool, { action: "create", subject: "Next" }))?.content).toEqual([
			{ type: "text", text: "Created #2: Next (pending)" },
		]);
	});

	it("clear resets module state and nextId", async () => {
		const { tool } = setup();
		await call(tool, { action: "create", subject: "a" });
		await call(tool, { action: "create", subject: "b" });
		const r = await call(tool, { action: "clear" });
		const d = r?.details as TaskDetails;
		expect(d.tasks).toEqual([]);
		expect(d.nextId).toBe(1);
	});
});

describe("registerTodoTool — execute persists a state entry for every state change", () => {
	it("appends the call's details snapshot as a state entry on create / update / delete / clear", async () => {
		const { tool, captured } = setup();
		const results = [
			await call(tool, { action: "create", subject: "a" }),
			await call(tool, { action: "update", id: 1, status: "in_progress" }),
			await call(tool, { action: "delete", id: 1 }),
			await call(tool, { action: "clear" }),
		];
		expect(captured.entries.map((e) => e.customType)).toEqual(Array(4).fill(STATE_ENTRY_TYPE));
		expect(captured.entries.map((e) => e.data)).toEqual(results.map((r) => r?.details));
		const cleared = captured.entries.at(-1)?.data as TaskDetails;
		expect(cleared.tasks).toEqual([]);
		expect(cleared.nextId).toBe(1);
	});

	it("appends nothing for reads, failures, or a no-effect update", async () => {
		const { tool, captured } = setup();
		await call(tool, { action: "create", subject: "a" });
		captured.entries.length = 0;
		await call(tool, { action: "list" });
		await call(tool, { action: "get", id: 1 });
		await call(tool, { action: "update", id: 99, status: "completed" });
		await call(tool, { action: "update", id: 1, status: "pending" });
		expect(captured.entries).toEqual([]);
	});
});

describe("registerTodoTool — renderCall", () => {
	it("renders an incomplete call without an undefined action label", () => {
		const { tool } = setup();
		const node = tool.renderCall!({ subject: "Still streaming" } as never, theme, undefined as never);
		expect(node.render(200).map(line => line.trimEnd()).join("\n")).toBe("todo");
	});

	it("create action emits 'todo +' and includes the subject", () => {
		const { tool } = setup();
		const node = tool.renderCall?.(
			{ action: "create", subject: "hello" } as never,
			theme,
			undefined as never,
		) as unknown as Text;
		expect(node).toBeInstanceOf(Text);
		const text = (node as unknown as { text: string }).text;
		expect(text).toContain("todo ");
		expect(text).toContain("+");
		expect(text).toContain("hello");
	});

	it("create action with tasks[] renders the batch size", () => {
		const { tool } = setup();
		const node = tool.renderCall!({ action: "create", tasks: [{ subject: "A" }, { subject: "B" }] } as never, theme, undefined as never);
		expect(node.render(200).map(line => line.trimEnd()).join("\n")).toBe("todo + 2 tasks");
	});

	it("update action renders '#id' when the task has not been registered yet", () => {
		const { tool } = setup();
		const node = tool.renderCall?.(
			{ action: "update", id: 42 } as never,
			theme,
			undefined as never,
		) as unknown as Text;
		expect((node as unknown as { text: string }).text).toContain("#42");
	});

	it("uses the task id when the call has no historical snapshot, even if the foreground has that id", async () => {
		const { tool } = setup();
		await call(tool, { action: "create", subject: "seeded-subject" });
		const node = tool.renderCall?.(
			{ action: "update", id: 1 } as never,
			theme,
			undefined as never,
		) as unknown as Text;
		expect(node.render(200).map(line => line.trimEnd()).join("\n")).toBe("todo → #1");
	});

	it.each(["update", "get", "delete"])("keeps a historical %s label stable after clear and id reuse", async action => {
		const { tool } = setup();
		await call(tool, { action: "create", subject: "Task A" });
		const args = { action, id: 1, ...(action === "update" ? { status: "in_progress" } : {}) };
		await call(tool, args);
		const before = tool.renderCall!(args as never, theme, undefined as never).render(200);
		await call(tool, { action: "clear" });
		await call(tool, { action: "create", subject: "Task B" });
		const after = tool.renderCall!(args as never, theme, undefined as never).render(200);
		expect(after).toEqual(before);
		expect(after.join("\n")).toContain("#1");
		expect(after.join("\n")).not.toMatch(/Task A|Task B/);
	});

	it("does not borrow a foreground subject for another session's same-id call", async () => {
		const { tool } = setup();
		await call(tool, { action: "create", subject: "foreground task" });
		const child = createMockCtx({ sessionId: "child-session" });
		await tool.execute("child-create", { action: "create", subject: "child task" } as never, undefined, undefined, child);
		const args = { action: "get", id: 1 };
		await tool.execute("child-get", args as never, undefined, undefined, child);
		const node = tool.renderCall!(args as never, theme, { toolCallId: "child-get" } as never);
		expect(node.render(200).map(line => line.trimEnd()).join("\n")).toBe("todo › #1");
	});

	it("list action with a status filter renders the humanized status label", () => {
		const { tool } = setup();
		const node = tool.renderCall?.(
			{ action: "list", status: "in_progress" } as never,
			theme,
			undefined as never,
		) as unknown as Text;
		expect((node as unknown as { text: string }).text).toContain("in progress");
	});

	it("clear action renders only the base prefix + glyph", () => {
		const { tool } = setup();
		const node = tool.renderCall?.({ action: "clear" } as never, theme, undefined as never) as unknown as Text;
		expect((node as unknown as { text: string }).text).toContain("∅");
	});
});

describe("registerTodoTool — renderResult", () => {
	it("shows a failed update's error instead of its requested status, collapsed or expanded", async () => {
		const { tool } = setup();
		await call(tool, { action: "create", subject: "unchanged" });
		const result = await call(tool, { action: "update", id: 999, status: "completed" });
		const errorTheme = makeTheme({ fg: (color, text) => `<${color}>${text}</${color}>` }) as Theme;
		for (const expanded of [false, true]) {
			const node = tool.renderResult!(result!, { expanded, isPartial: false }, errorTheme, undefined as never);
			expect(node.render(200).map(line => line.trimEnd()).join("\n")).toBe("<error>✗ #999 not found</error>");
		}
		expect((await call(tool, { action: "get", id: 1 }))?.details).toMatchObject({
			tasks: [{ id: 1, subject: "unchanged", status: "pending" }], nextId: 2,
		});
	});

	it.each([false, true])("shows and sanitizes host failures even with successful-looking details=%s", async withDetails => {
		const { tool } = setup();
		const created = await call(tool, { action: "create", subject: "existing task" });
		const result = {
			content: [{ type: "text", text: "Schema\x1b[2J rejected" }, { type: "text", text: "the call\u202e" }],
			details: withDetails ? created!.details : undefined,
		};
		const errorTheme = makeTheme({ fg: (color, text) => `<${color}>${text}</${color}>` }) as Theme;
		for (const expanded of [false, true]) {
			const node = tool.renderResult!(result as never, { expanded, isPartial: false }, errorTheme, { isError: true } as never);
			expect(node.render(200).map(line => line.trimEnd()).join("\n")).toBe("<error>✗ Schema rejected the call</error>");
		}
	});

	it("keeps a host failure visibly unsuccessful when no text is available", () => {
		const { tool } = setup();
		const node = tool.renderResult!({ content: [], details: undefined }, { expanded: false, isPartial: false }, theme, { isError: true } as never);
		expect(node.render(200).map(line => line.trimEnd()).join("\n")).toBe("✗ Tool execution failed");
	});

	it("create renders the new task's status label (pending)", async () => {
		const { tool } = setup();
		const r = await call(tool, { action: "create", subject: "a" });
		const node = tool.renderResult?.(r as never, {} as never, theme, undefined as never) as unknown as Text;
		expect((node as unknown as { text: string }).text).toContain("pending");
		expect((node as unknown as { text: string }).text).toContain("○");
	});

	it("update renders the transitioned status (in progress)", async () => {
		const { tool } = setup();
		await call(tool, { action: "create", subject: "a" });
		const r = await call(tool, { action: "update", id: 1, status: "in_progress" });
		const node = tool.renderResult?.(r as never, {} as never, theme, undefined as never) as unknown as Text;
		const text = (node as unknown as { text: string }).text;
		expect(text).toContain("in progress");
		expect(text).toContain("◐");
	});

	it("delete renders the deleted-tombstone label", async () => {
		const { tool } = setup();
		await call(tool, { action: "create", subject: "a" });
		const r = await call(tool, { action: "delete", id: 1 });
		const node = tool.renderResult?.(r as never, {} as never, theme, undefined as never) as unknown as Text;
		const text = (node as unknown as { text: string }).text;
		expect(text).toContain("deleted");
		expect(text).toContain("⊘");
	});

	it("list renders the plain '✓' fallback (no status leakage)", async () => {
		const { tool } = setup();
		await call(tool, { action: "create", subject: "a" });
		const r = await call(tool, { action: "list" });
		const node = tool.renderResult?.(r as never, {} as never, theme, undefined as never) as unknown as Text;
		expect((node as unknown as { text: string }).text).toContain("✓");
	});

	it("get renders the plain '✓' fallback", async () => {
		const { tool } = setup();
		await call(tool, { action: "create", subject: "a" });
		const r = await call(tool, { action: "get", id: 1 });
		const node = tool.renderResult?.(r as never, {} as never, theme, undefined as never) as unknown as Text;
		expect((node as unknown as { text: string }).text).toContain("✓");
	});

	it("clear renders the plain '✓' fallback", async () => {
		const { tool } = setup();
		await call(tool, { action: "clear" });
		const r = await call(tool, { action: "clear" });
		const node = tool.renderResult?.(r as never, {} as never, theme, undefined as never) as unknown as Text;
		expect((node as unknown as { text: string }).text).toContain("✓");
	});

	it("missing details falls back to plain '✓'", () => {
		const { tool } = setup();
		const node = tool.renderResult?.(
			{ content: [], details: undefined } as never,
			{} as never,
			theme,
			undefined as never,
		) as unknown as Text;
		expect((node as unknown as { text: string }).text).toContain("✓");
	});
});
