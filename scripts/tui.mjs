import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { StringDecoder } from "node:string_decoder";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import xterm from "@xterm/headless";
import { savePreview } from "../.test/terminal-preview.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const sandbox = process.env.KIMI_TEST_SANDBOX;
assert.equal(process.env.KIMI_TEST_ISOLATED, "1");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runTerminal(mode, { packedPath, smokeOnly = false, combination = false, resumePath } = {}) {
  const work = join(sandbox, `${mode}-${combination ? "combo" : "solo"}-${resumePath ? "resume" : smokeOnly ? "smoke" : "full"}`);
  const agentDir = join(work, "agent"); const home = join(work, "home"); const cwd = join(work, "workspace");
  for (const path of [agentDir, home, cwd]) mkdirSync(path, { recursive: true });
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: "kimi-fixture", defaultModel: "scripted", theme: "dark", quietStartup: true, compaction: { enabled: false }, cacheWarming: "off", enableInstallTelemetry: false, enableAnalytics: false }));
  writeFileSync(join(agentDir, "auth.json"), "{}");
  const terminal = new xterm.Terminal({ cols: 120, rows: 42, allowProposedApi: true, scrollback: 2000 });
  const cli = resolve(root, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");
  const args = ["scripts/pty-bridge.py", "42", "120", process.execPath, "--import", join(root, "scripts/network-guard.mjs"), cli,
    "--offline", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-mcp", "--no-approve",
    "--tui-mode", mode, "--extension", packedPath ?? process.env.KIMI_EXTENSION_PATH ?? root,
    "--extension", join(root, ".test/fixture-extension.ts"), "--model", "kimi-fixture/scripted", "--thinking", "off"];
  if (combination) args.push("--extension", join(root, ".test/composition.ts"));
  if (resumePath) args.push("--session", resumePath);
  const bridge = spawn("python3", args.map((arg, i) => i === 0 ? join(root, arg) : arg), {
    cwd, env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(work, "config"), XDG_CACHE_HOME: join(work, "cache"), XDG_DATA_HOME: join(work, "data"),
      PI_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_SESSION_DIR: join(work, "sessions"), PI_TRUE_COLOR: "1", PI_IMAGE_PROTOCOL: "none",
      KIMI_NETWORK_REPORT: join(work, "network") }, stdio: ["pipe", "pipe", "pipe"]
  });
  let raw = "", stderr = "", childExit;
  const decoder = new StringDecoder("utf8");
  let pending = Promise.resolve();
  const send = value => { if (!bridge.stdin.destroyed) bridge.stdin.write(JSON.stringify(value) + "\n"); };
  const input = text => send({ input: Buffer.from(text).toString("base64") });
  const write = data => new Promise(done => terminal.write(data, done));
  terminal.onData(data => input(data)); // DA/DSR replies from the emulator.
  bridge.stderr.on("data", data => { stderr += data; });
  createInterface({ input: bridge.stdout }).on("line", line => {
    const message = JSON.parse(line);
    if (message.data) {
      const data = decoder.write(Buffer.from(message.data, "base64")); raw += data;
      // xterm.js doesn't implement Kitty negotiation. Emulate a supporting terminal.
      if (data.includes("\x1b[?u")) input("\x1b[?7u");
      pending = pending.then(() => write(data));
    } else if (message.exit !== undefined) childExit = message.exit;
  });
  const screen = () => Array.from({ length: terminal.rows }, (_, i) => terminal.buffer.active.getLine(terminal.buffer.active.viewportY + i)?.translateToString(true) ?? "");
  const snapshot = async () => { await pending; return screen(); };
  async function waitFor(predicate, label, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const lines = await snapshot();
      if (predicate(lines)) return lines;
      if (childExit !== undefined) throw new Error(`Pi exited ${childExit} while ${label}: ${stderr}\n${lines.join("\n")}\n${raw.slice(-3000)}`);
      await sleep(60);
    }
    throw new Error(`Timed out ${label}: ${stderr}\n${(await snapshot()).join("\n")}\n${raw.slice(-1200)}`);
  }
  async function prompt(text) {
    input(text); await sleep(80); input("\r");
    // Tool changes and settling are asynchronous; "Fixture ready." appears in the transcript.
    await sleep(800);
  }
  async function command(text) { input(text); await sleep(80); input("\r"); await sleep(350); }
  const widget = lines => {
    const start = lines.findLastIndex(line => line.trim() === "Todo");
    if (start < 0) return [];
    const end = lines.findIndex((line, i) => i > start && /(?:all \d+ items|showing \d+ of \d+ items|\d+ items · \d+ completed)/.test(line));
    return end < start ? [] : lines.slice(start, end + 1).map(line => line.trim());
  };
  async function resize(cols, rows) {
    terminal.resize(cols, rows); send({ resize: [rows, cols] }); await sleep(450);
  }
  try {
    await waitFor(lines => lines.some(line => line.includes(combination ? "Synthetic HUD" : "scripted")), "startup");
    if (!resumePath) {
      assert.equal(widget(await snapshot()).length, 0, "empty session has no widget");
      await prompt("seed small");
    }
    const seeded = await waitFor(lines => widget(lines).some(line => line.includes("all 5 items")), "five tasks");
    assert.deepEqual(widget(seeded).slice(0, 6), ["Todo", "✓ 建立数据模型", "✓ 补充校验逻辑", "● 编写边界测试 👋", "○ 验证终端交互", "○ 更新使用说明"]);
    const widgetTop = seeded.findLastIndex(line => line.trim() === "Todo");
    if (process.env.KIMI_WRITE_PREVIEW === "1" && mode === "regular" && !combination && !resumePath) {
      mkdirSync(join(root, "docs"), { recursive: true });
      savePreview(terminal, widgetTop, 7, join(root, "docs/preview.svg"));
    }
    const buffer = terminal.buffer.active;
    const cellAt = (row, char) => {
      const line = buffer.getLine(buffer.viewportY + row);
      for (let i = 0; i < terminal.cols; i++) if (line.getCell(i)?.getChars() === char) return line.getCell(i);
      throw new Error(`Missing ${char} at row ${row}`);
    };
    assert(cellAt(widgetTop + 1, "建").isStrikethrough(), "completion is struck through in actual terminal");
    assert(cellAt(widgetTop + 3, "编").isBold(), "current task uses bold in actual terminal");
    assert.notEqual(cellAt(widgetTop + 1, "✓").getFgColor(), cellAt(widgetTop + 3, "●").getFgColor(), "green and accent are distinct");
    if (combination) assert(seeded.some(line => line.includes("Synthetic HUD")), "combination HUD remains present");
    // Ctrl+T belongs to thinking and must not collapse the widget.
    input("\x14"); await sleep(250); assert.equal(widget(await snapshot()).length, 7);
    // Retain editor contents and focus throughout actual keyboard toggles.
    input("focus 中文"); await sleep(200);
    input("\x1b[116;6u");
    await waitFor(lines => widget(lines).some(line => line.includes("to expand")), "collapse hotkey");
    const collapsedScreen = await snapshot();
    assert(collapsedScreen.some(line => line.includes("focus 中文")), "collapse preserves editor");
    assert.equal(collapsedScreen.filter(line => /^\s*[○●✓] (?:建立|补充|编写|验证|更新|合成)/.test(line)).length, 0, "collapse leaves no stale task rows");
    input("+kept"); input("\x1b[116;6u");
    await waitFor(lines => widget(lines).some(line => line.includes("to collapse")), "expand hotkey");
    assert((await snapshot()).some(line => line.includes("focus 中文+kept")), "widget never takes editor focus");
    input("\x03"); await sleep(100); // clear synthetic draft, not submit
    if (smokeOnly) {
      assert(!/Extension error|Cannot find module|not a constructor|Forbidden network/.test(raw));
      return { mode, smokeOnly, passed: true };
    }
    // Actual /todos screen scrolls independently, Escape restores editor and widget.
    await command("/todos");
    await waitFor(lines => lines.some(line => line.includes("Todo · details")), "/todos details");
    assert((await snapshot()).some(line => line.includes("Synthetic detail")));
    input("\x1b"); await sleep(150);
    await waitFor(lines => widget(lines).length === 7, "escape from details");
    if (!combination) {
      await prompt("invalid update");
      const failed = await waitFor(lines => lines.some(line => line.includes("✗ #999 not found")), "in-band error presentation");
      const errorRow = failed.findIndex(line => line.includes("✗ #999 not found"));
      assert.notEqual(cellAt(errorRow, "✗").getFgColor(), cellAt(failed.findLastIndex(line => line.trim() === "Todo") + 1, "✓").getFgColor(), "error and success colors differ");
      input("\x0f"); await sleep(150);
      assert((await snapshot()).some(line => line.includes("✗ #999 not found")), "expanded result retains the error");
      input("\x0f"); await sleep(150);
      await prompt("invalid schema");
      await waitFor(lines => lines.some(line => /✗ .*Validation failed for tool/.test(line)), "host schema error presentation");
      assert.equal(widget(await snapshot()).length, 7, "failed tools do not change task state");
    }
    const darkHeadingColor = cellAt((await snapshot()).findLastIndex(line => line.trim() === "Todo"), "T").getFgColor();
    await command("/fixture-light");
    const light = await waitFor(lines => widget(lines).length === 7, "light theme");
    assert(light.some(line => line.includes("✓ 建立数据模型")));
    assert.notEqual(cellAt(light.findLastIndex(line => line.trim() === "Todo"), "T").getFgColor(), darkHeadingColor, "theme switch updates actual ANSI colors");
    await command("/fixture-dark");
    // /reload replays all task state and resets UI collapse, without losing input.
    input("\x1b[116;6u"); await sleep(120);
    await command("/reload");
    await waitFor(lines => widget(lines).length === 7 && widget(lines).at(-1).includes("to collapse"), "reload replay");
    const configDir = join(work, "config/pi-kimi-style-todo"); mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.json"), '{"collapseKey":"alt+o"}');
    input("draft"); await sleep(100);
    assert(widget(await snapshot()).at(-1).includes("ctrl+shift+t"), "hint remains the actually bound key before reload");
    input("\x03"); await command("/reload");
    await waitFor(lines => widget(lines).at(-1)?.includes("alt+o to collapse"), "custom key rebind");
    input("\x1b[116;6u"); await sleep(120); assert.equal(widget(await snapshot()).length, 7, "old key is no longer bound");
    input("\x1b[111;3u"); // Alt+O in the negotiated Kitty protocol
    await waitFor(lines => widget(lines).at(-1)?.includes("alt+o to expand"), "actual custom shortcut");
    writeFileSync(join(agentDir, "keybindings.json"), '{"app.thinking.toggle":"alt+o"}');
    await command("/reload");
    await waitFor(lines => widget(lines).at(-1) === "all 5 items", "new host-key conflict on the same reload");
    writeFileSync(join(agentDir, "keybindings.json"), '{}');
    writeFileSync(join(configDir, "config.json"), '{"collapseKey":"off"}'); await command("/reload");
    await waitFor(lines => widget(lines).at(-1) === "all 5 items", "shortcut off");
    writeFileSync(join(configDir, "config.json"), '{"collapseKey":"ctrl+t"}'); await command("/reload");
    await waitFor(lines => widget(lines).at(-1) === "all 5 items", "conflicting shortcut disabled");
    assert(raw.includes("TODO shortcut ctrl+t disabled"), "conflict diagnosis is shown");
    input("\x14"); await sleep(120); assert.equal(widget(await snapshot()).length, 7);
    writeFileSync(join(configDir, "config.json"), '{"collapseKey":"ctrl+i"}'); await command("/reload");
    await waitFor(lines => widget(lines).at(-1) === "all 5 items", "Ctrl+I/Tab conflict disabled");
    assert(raw.includes("TODO shortcut ctrl+i disabled"), "terminal alias conflict is diagnosed");
    input("/fixture-li"); await sleep(150); input("\t");
    await waitFor(lines => lines.slice(-6).some(line => line.includes("/fixture-light")), "Tab still completes editor input");
    assert.equal(widget(await snapshot()).length, 7, "Tab does not collapse the widget");
    input("\x03"); await sleep(100);
    writeFileSync(join(configDir, "config.json"), '{"collapseKey":"ctrl+m"}'); await command("/reload");
    await waitFor(lines => widget(lines).at(-1) === "all 5 items", "Ctrl+M/Enter conflict disabled");
    assert(raw.includes("TODO shortcut ctrl+m disabled"), "Enter alias conflict is diagnosed");
    await prompt("enter alias probe");
    await waitFor(lines => lines.some(line => line.includes("Enter submit survived.")), "Enter still submits editor input");
    assert.equal(widget(await snapshot()).length, 7, "Enter does not collapse the widget");
    writeFileSync(join(configDir, "config.json"), '{}'); await command("/reload");
    await waitFor(lines => widget(lines).at(-1)?.includes("ctrl+shift+t to collapse"), "restore default shortcut");
    await prompt("seed large");
    const large = await waitFor(lines => widget(lines).some(line => line.includes("showing 10 of 16")), "overflow");
    assert(widget(large).some(line => line.includes("● 合成任务 16")), "late in_progress stays visible");
    input("\x0f"); await sleep(250); // host Ctrl+O tool expansion must not unbound the widget
    assert.equal(widget(await snapshot()).length, 12);
    input("\x0f"); await sleep(150);
    await resize(80, 24);
    const narrow = await waitFor(lines => widget(lines).some(line => line.includes("showing 8 of 16")), "narrow terminal");
    assert(widget(narrow).some(line => line.includes("● 合成任务 16")));
    assert.equal(narrow.filter(line => /^\s*[○●✓] (?:建立|补充|编写|验证|更新|合成)/.test(line)).length, 8, "resize clears old widget rows");
    await resize(80, 12);
    const short = await waitFor(lines => widget(lines).some(line => line.includes("showing 2 of 16")), "short terminal");
    assert(widget(short).some(line => line.includes("● 合成任务 16")));
    assert.equal(short.filter(line => /^\s*[○●✓] (?:建立|补充|编写|验证|更新|合成)/.test(line)).length, 2);
    await resize(120, 42);
    await prompt("seed encoded"); await waitFor(lines => widget(lines).some(line => line.includes("all 5 items")), "restore list from double-encoded batch");
    await prompt("complete");
    const completed = await waitFor(lines => widget(lines).filter(line => line.startsWith("✓ ")).length === 5, "all completed");
    assert(widget(completed).at(-1).includes("all 5 items"));
    await prompt("list");
    assert.equal(widget(await snapshot()).filter(line => line.startsWith("✓ ")).length, 5, "completion retention across turns");
    await prompt("clear");
    const clearedScreen = await waitFor(lines => widget(lines).length === 0, "clear unmount");
    assert.equal(clearedScreen.filter(line => /^\s*[○●✓] (?:建立|补充|编写|验证|更新|合成)/.test(line)).length, 0, "clear removes every widget row");
    if (!combination) {
      await prompt("reuse id");
      const hasHistoricalId = lines => lines.some(line => line.trim() === "todo › #1") && widget(lines).some(line => line.includes("○ Replacement task"));
      await waitFor(hasHistoricalId, "historical call after id reuse");
      input("\x0f"); await sleep(150);
      assert(hasHistoricalId(await snapshot()), "expansion does not relabel old calls with the replacement subject");
      input("\x0f"); await sleep(150);
      await command("/reload");
      await waitFor(hasHistoricalId, "historical call after replay");
    }
    await prompt("seed one");
    await waitFor(lines => widget(lines).length === 3 && widget(lines).at(-1).includes("all 1 items"), "single-item widget");
    await prompt("seed small");
    await waitFor(lines => widget(lines).length === 7, "re-register widget");
    input("\x1b"); await sleep(100); input("typing-after-esc"); await sleep(100);
    assert((await snapshot()).some(line => line.includes("typing-after-esc")), "Escape retains normal editor focus");
    input("\x03");
    // Synthetic screenshot data is kept out of the package; a reviewed SVG is generated separately.
    writeFileSync(join(work, "screen.json"), JSON.stringify(await snapshot()));
    assert(!/Extension error|Cannot find module|not a constructor|Forbidden network/.test(raw));
    const files = readdirSync(join(work, "sessions"), { recursive: true }).filter(file => file.endsWith(".jsonl"));
    assert.equal(files.length, 1);
    return { mode, combination, passed: true, sessionFile: join(work, "sessions", files[0]) };
  } finally {
    send({ close: true });
    await new Promise(resolve => { if (bridge.exitCode !== null) resolve(); else bridge.once("exit", resolve); });
    terminal.dispose();
    const reports = readdirSync(work).filter(file => file.startsWith("network-") && file.endsWith(".json"));
    assert(reports.length > 0, "network guard report exists");
    for (const file of reports) assert.equal(JSON.parse(readFileSync(join(work, file), "utf8")).attempts, 0);
    assert.equal(childExit, 0, `Pi must exit cleanly: ${childExit}; ${stderr}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const mode of ["regular", "fullscreen"]) {
    const result = await runTerminal(mode, { packedPath: process.env.KIMI_EXTENSION_PATH, smokeOnly: process.env.KIMI_TUI_SMOKE === "1" });
    console.log({ ...result, sessionFile: undefined });
    if (!process.env.KIMI_TUI_SMOKE) {
      console.log(await runTerminal(mode, { smokeOnly: true, resumePath: result.sessionFile }));
      console.log({ ...await runTerminal(mode, { combination: true }), sessionFile: undefined });
    }
  }
  console.log("PASS real Pi PTY matrix; network attempts: 0");
}
