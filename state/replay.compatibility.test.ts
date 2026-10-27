import { expect, it } from "vitest";
import { replayFromBranch } from "./replay.js";

it("falls back to a valid legacy snapshot when newer custom state has malformed tasks", () => {
	const valid = {
		tasks: [
			{ id: 1, subject: "Root", status: "completed", owner: "fixture", metadata: { keep: true } },
			{ id: 2, subject: "Leaf", status: "pending", blockedBy: [1], description: "Synthetic detail" },
		],
		nextId: 3,
	};
	const branch = [
		{ type: "message", message: { role: "toolResult", toolName: "todo", details: valid } },
		{ type: "custom", customType: "rpiv-todo-state", data: { tasks: ["...truncated"], nextId: 99 } },
	];
	expect(replayFromBranch({ sessionManager: { getBranch: () => branch } })).toEqual(valid);
});
