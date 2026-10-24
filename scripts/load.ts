import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

assert.equal(process.env.KIMI_TEST_ISOLATED, "1");
const root = fileURLToPath(new URL("../", import.meta.url));
const cwd = join(process.env.KIMI_TEST_SANDBOX!, "workspace");
const agentDir = process.env.PI_CODING_AGENT_DIR!;
mkdirSync(cwd, { recursive: true });
writeFileSync(join(agentDir, "auth.json"), "{}");
const settingsManager = SettingsManager.inMemory({ packages: [], extensions: [], enableInstallTelemetry: false });
const loader = new DefaultResourceLoader({
  cwd, agentDir, settingsManager,
  noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
  additionalExtensionPaths: [resolve(process.env.KIMI_EXTENSION_PATH ?? root)]
});
await loader.reload();
const loaded = loader.getExtensions();
assert.deepEqual(loaded.errors, []);
assert.deepEqual(loaded.warnings ?? [], []);
assert.equal(loaded.extensions.length, 1);
const extension = loaded.extensions[0];
assert.deepEqual([...extension.tools.keys()], ["todo"]);
assert.deepEqual([...extension.commands.keys()], ["todos"]);
assert.deepEqual([...extension.shortcuts.keys()], []); // TUI session_start binds after host keybindings are installed.
console.log("PASS Pi 1.2.0 resource loading: one todo and /todos, TUI shortcut deferred; no errors/warnings");

const cli = resolve(root, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");
const args = ["--import", join(root, "scripts/network-guard.mjs"), cli, "--offline", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-mcp", "--no-session", "--no-approve", "--extension", process.env.KIMI_EXTENSION_PATH ?? root, "--extension", join(root, ".test/fixture-extension.ts"), "--model", "kimi-fixture/scripted", "--thinking", "off"];
for (const mode of ["text", "json"]) {
  const result = spawnSync(process.execPath, [...args, "--mode", mode, "--print", "seed small"], { cwd, env: process.env, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr.trim(), "");
  assert(!result.stdout.includes("\x1b["), "headless stdout has no terminal sequences");
  if (mode === "text") assert.equal(result.stdout.trim(), "Fixture ready.");
  else {
    const records = result.stdout.trim().split("\n").map(line => JSON.parse(line));
    const end = records.findLast(record => record.type === "tool_execution_end" && record.toolName === "todo");
    assert.equal(end.result.details.tasks.length, 5);
    assert.deepEqual(end.result.details.tasks.map((task: { status: string }) => task.status), ["completed", "completed", "in_progress", "pending", "pending"]);
  }
  console.log(`PASS real Pi ${mode} mode: todo mutations without TUI`);
}

await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, [...args, "--mode", "rpc"], { cwd, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
  let buffer = "", stderr = "", finished = false, notified = false;
  const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`RPC timeout: ${stderr}`)); }, 30000);
  const send = (data: unknown) => child.stdin.write(JSON.stringify(data) + "\n");
  child.stderr.on("data", data => { stderr += data; });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", data => {
    buffer += data;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        if (record.type === "agent_settled") send({ id: "todos", type: "prompt", message: "/todos" });
        if (record.type === "extension_ui_request" && record.method === "notify") {
          assert(record.message.includes("建立数据模型")); assert(record.message.includes("Synthetic detail")); notified = true;
        }
        if (record.type === "response" && record.id === "todos") {
          assert.equal(record.success, true); assert.equal(record.data.disposition, "handled");
          finished = true; child.stdin.end();
        }
      } catch (error) { child.kill("SIGTERM"); reject(error); }
    }
  });
  child.on("error", reject);
  child.on("close", code => {
    clearTimeout(timer);
    try { assert.equal(code, 0, stderr); assert(finished && notified, "RPC /todos must notify, never call custom TUI"); assert.equal(stderr.trim(), ""); resolve(); } catch (error) { reject(error); }
  });
  send({ id: "seed", type: "prompt", message: "seed small" });
});
console.log("PASS real Pi RPC: todo state and /todos notification, no custom TUI");

if (!process.env.KIMI_OPTIONAL_PROBE && !process.env.KIMI_EXTENSION_PATH) {
  const standalone = join(process.env.KIMI_TEST_SANDBOX!, "without-i18n");
  mkdirSync(join(standalone, "node_modules/@juicesharp"), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  writeFileSync(join(standalone, "package.json"), JSON.stringify(manifest));
  for (const file of manifest.files.filter((file: string) => file.endsWith(".ts") || file === "locales/")) {
    cpSync(join(root, file), join(standalone, file), { recursive: true });
  }
  symlinkSync(join(root, "node_modules/@juicesharp/rpiv-config"), join(standalone, "node_modules/@juicesharp/rpiv-config"), "dir");
  assert.throws(() => createRequire(join(standalone, "package.json")).resolve("@juicesharp/rpiv-i18n"));
  const fallback = spawnSync(process.execPath, ["--import", join(root, "scripts/network-guard.mjs"), "--import", "tsx", fileURLToPath(import.meta.url)], {
    cwd: root, env: { ...process.env, KIMI_OPTIONAL_PROBE: "1", KIMI_EXTENSION_PATH: standalone }, encoding: "utf8", timeout: 60000
  });
  assert.equal(fallback.status, 0, fallback.stdout + fallback.stderr);
  assert.equal(fallback.stderr, "");
  console.log("PASS optional i18n absent: standalone resource, text, JSON and RPC loading");
}
