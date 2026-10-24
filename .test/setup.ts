import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach } from "vitest";

if (process.env.KIMI_TEST_ISOLATED !== "1") throw new Error("Run tests through npm test (isolated HOME required)");
const home = mkdtempSync(join(tmpdir(), "kimi-todo-unit-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.PI_CODING_AGENT_DIR = join(home, "agent");
delete process.env.XDG_CONFIG_HOME;

beforeEach(async () => {
  delete process.env.XDG_CONFIG_HOME;
  for (const dir of [".config", ".pi", "agent"]) rmSync(join(home, dir), { recursive: true, force: true });
  mkdirSync(process.env.PI_CODING_AGENT_DIR!, { recursive: true });
  const todo = await import("../state/store.js");
  todo.__resetState();
  const i18n = await import("@juicesharp/rpiv-i18n");
  i18n.__resetState();
});
afterAll(() => rmSync(home, { recursive: true, force: true }));
