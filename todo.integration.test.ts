// Real Pi SDK lifecycle integration, using only synthetic sessions and a local faux provider.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage, fauxProvider, fauxToolCall, type JsonObject } from "@earendil-works/pi-ai";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, type AgentSession } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import type { TaskDetails } from "./tool/types.js";

it("preserves full task/graph snapshots across real reload, tree, compaction and resume", async () => {
  const home = mkdtempSync(join(tmpdir(), "kimi-lifecycle-"));
  const cwd = join(home, "workspace"), agentDir = join(home, "agent"), sessionDir = join(home, "sessions");
  for (const dir of [cwd, agentDir, sessionDir]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(agentDir, "auth.json"), "{}");
  const faux = fauxProvider({ provider: "lifecycle-fixture", models: [{ id: "scripted" }] });
  const runtime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json") });
  runtime.registerNativeProvider(faux.provider);
  const sessions: AgentSession[] = [];
  const errors: unknown[] = [];
  async function open(manager: SessionManager) {
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false, keepRecentTokens: 1 }, retry: { enabled: false } });
    const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
      additionalExtensionPaths: [fileURLToPath(new URL(".", import.meta.url))],
      extensionFactories: [pi => pi.on("session_before_compact", event => ({ compaction: { summary: "Synthetic compaction", firstKeptEntryId: event.preparation.firstKeptEntryId, tokensBefore: event.preparation.tokensBefore } }))]
    });
    await loader.reload(); expect(loader.getExtensions().errors).toEqual([]);
    const { session } = await createAgentSession({ cwd, agentDir, resourceLoader: loader, modelRuntime: runtime, model: faux.getModel(), settingsManager, sessionManager: manager });
    sessions.push(session); await session.bindExtensions({ onError: error => { errors.push(error); } }); return session;
  }
  async function call(session: AgentSession, args: JsonObject): Promise<TaskDetails> {
    faux.setResponses([fauxAssistantMessage(fauxToolCall("todo", args)), fauxAssistantMessage("ok")]);
    await session.prompt("synthetic step");
    const entry = session.sessionManager.getBranch().findLast(entry => entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "todo");
    if (entry?.type !== "message" || entry.message.role !== "toolResult") throw new Error("Missing todo result");
    const details = entry.message.details as TaskDetails;
    expect(details.error, JSON.stringify(entry.message)).toBeUndefined();
    return details;
  }
  try {
    const session = await open(SessionManager.create(cwd, sessionDir));
    await call(session, { action: "create", subject: "A", description: "detail", activeForm: "Working", owner: "fixture", metadata: { sample: "keep", remove: 1 } });
    await call(session, { action: "create", subject: "B", blockedBy: [1] });
    const expected = (await call(session, { action: "update", id: 1, status: "in_progress", metadata: { remove: null } })).tasks;
    const checkpoint = session.sessionManager.getLeafId()!;
    await call(session, { action: "update", id: 1, status: "completed" });
    await call(session, { action: "delete", id: 2 });
    await session.reload();
    const afterReload = await call(session, { action: "list", includeDeleted: true });
    expect(afterReload.tasks.map(t => t.status)).toEqual(["completed", "deleted"]);
    expect(afterReload.tasks[0].metadata).toEqual({ sample: "keep" });
    const navigated = await session.navigateTree(checkpoint, { summarize: false });
    expect(navigated.cancelled).toBe(false);
    expect((await call(session, { action: "list" })).tasks).toEqual(expected);
    await session.compact();
    expect(session.sessionManager.getBranch().some(entry => entry.type === "compaction")).toBe(true);
    expect((await call(session, { action: "list" })).tasks).toEqual(expected);
    const file = session.sessionFile!;
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }); session.dispose();
    const resumed = await open(SessionManager.open(file, sessionDir));
    expect((await call(resumed, { action: "list" })).tasks).toEqual(expected);
    // A fresh concurrent session must not inherit the resumed branch's state.
    const other = await open(SessionManager.create(cwd, sessionDir));
    expect((await call(other, { action: "list" })).tasks).toEqual([]);
    expect((await call(resumed, { action: "list" })).tasks).toEqual(expected);
    expect(errors).toEqual([]);
  } finally {
    for (const session of sessions) { try { await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }); } catch {} session.dispose(); }
    rmSync(home, { recursive: true, force: true });
  }
});
