import type { Theme } from "@earendil-works/pi-coding-agent";
import { makeTheme } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it } from "vitest";
import type { Task } from "../tool/types.js";
import { formatOverlayTaskLine } from "./format.js";

const recordingTheme = makeTheme({
	fg: (color, text) => `<${color}>${text}</${color}>`,
	strikethrough: (text) => `<strike>${text}</strike>`,
	bold: (text) => `<bold>${text}</bold>`,
}) as unknown as Theme;

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: 1,
		subject: "quiet task",
		status: "pending",
		...overrides,
	};
}

describe("formatOverlayTaskLine — semantic color hierarchy", () => {
	it("keeps pending subjects primary while rendering IDs quietly", () => {
		expect(formatOverlayTaskLine(task(), recordingTheme, true)).toBe(
			"<dim>○</dim> <dim>#1</dim> <text>quiet task</text>",
		);
	});

	it("emphasizes the current task while muting its supporting metadata", () => {
		expect(
			formatOverlayTaskLine(
				task({ status: "in_progress", activeForm: "Working", blockedBy: [2, 3] }),
				recordingTheme,
				true,
			),
		).toBe(
			"<accent>●</accent> <dim>#1</dim> <bold><text>quiet task</text></bold> <muted>⛓ #2,#3</muted>",
		);
	});

	it("mutes and strikes completed subjects", () => {
		expect(formatOverlayTaskLine(task({ status: "completed" }), recordingTheme, false)).toBe(
			"<success>✓</success> <strike><muted>quiet task</muted></strike>",
		);
	});
});

describe("formatOverlayTaskLine — terminal control characters", () => {
	it("strips escape sequences from subject and activeForm before theming", () => {
		expect(
			formatOverlayTaskLine(
				task({ status: "in_progress", subject: "quiet\u001b[2Jtask", activeForm: "Work\u009bcing" }),
				recordingTheme,
				false,
			),
		).toBe("<accent>●</accent> <bold><text>quiettask</text></bold>");
	});
});
