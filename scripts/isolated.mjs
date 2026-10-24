import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const sandbox = mkdtempSync(join(tmpdir(), "kimi-todo-check-"));
const env = {
  PATH: process.env.PATH, LANG: "C.UTF-8", TERM: "xterm-256color", COLORTERM: "truecolor",
  HOME: join(sandbox, "home"), USERPROFILE: join(sandbox, "home"),
  XDG_CONFIG_HOME: join(sandbox, "config"), XDG_CACHE_HOME: join(sandbox, "cache"),
  XDG_DATA_HOME: join(sandbox, "data"), PI_CODING_AGENT_DIR: join(sandbox, "agent"),
  PI_CODING_AGENT_SESSION_DIR: join(sandbox, "sessions"),
  PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0",
  KIMI_TEST_ISOLATED: "1", KIMI_TEST_SANDBOX: sandbox,
  KIMI_WRITE_PREVIEW: process.argv.includes("--preview") ? "1" : "0",
  npm_config_ignore_scripts: "true", npm_config_audit: "false", npm_config_fund: "false"
};
for (const dir of [env.HOME, env.XDG_CONFIG_HOME, env.PI_CODING_AGENT_DIR, join(sandbox, "workspace")]) mkdirSync(dir, { recursive: true });
const commands = {
  unit: [process.execPath, ["--import", resolve(root, "scripts/network-guard.mjs"), resolve(root, "node_modules/vitest/vitest.mjs"), "run", ...process.argv.slice(3)]],
  load: [process.execPath, ["--import", resolve(root, "scripts/network-guard.mjs"), "--import", "tsx", resolve(root, "scripts/load.ts")]],
  tui: [process.execPath, [resolve(root, "scripts/tui.mjs")]],
  pack: [process.execPath, [resolve(root, "scripts/pack.mjs")]]
};
try {
  const command = commands[process.argv[2]];
  if (!command) throw new Error("Unknown check");
  const result = spawnSync(command[0], command[1], { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { rmSync(sandbox, { recursive: true, force: true }); }
