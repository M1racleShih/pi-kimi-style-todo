import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getCompletedDisplay, getMaxWidgetLines, loadConfig } from "./config.js";

function put(path: string, value: string) { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, value); }
const own = () => join(process.env.HOME!, ".config/pi-kimi-style-todo/config.json");
describe("independent configuration", () => {
  it("does not read or modify legacy rpiv-todo configuration", () => {
    const path = join(process.env.HOME!, ".config/rpiv-todo/config.json");
    const data = '{"maxWidgetLines":99,"collapseKey":"ctrl+t"}'; put(path, data);
    expect(getMaxWidgetLines()).toBe(12);
    expect(loadConfig()).toEqual({}); expect(readFileSync(path, "utf8")).toBe(data);
  });
  it.each(["null", "[]", "123", '"text"', '{"maxWidgetLines":1e999}', '{"maxWidgetLines":3.5}', '{"maxWidgetLines":9007199254740992}'])("falls back for invalid document/value %s", value => {
    put(own(), value); expect(getMaxWidgetLines()).toBe(12);
  });
  it("warns and uses defaults for malformed JSON without a hidden legacy takeover", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    put(own(), "{broken"); expect(loadConfig()).toEqual({}); expect(warn).toHaveBeenCalled();
  });
  it("honors valid XDG with same-namespace fallback, and rejects relative XDG", () => {
    put(own(), '{"maxWidgetLines":8}');
    process.env.XDG_CONFIG_HOME = join(process.env.HOME!, "xdg");
    expect(getMaxWidgetLines()).toBe(8);
    put(join(process.env.XDG_CONFIG_HOME, "pi-kimi-style-todo/config.json"), '{"maxWidgetLines":5}');
    expect(getMaxWidgetLines()).toBe(5);
    process.env.XDG_CONFIG_HOME = "relative"; expect(getMaxWidgetLines()).toBe(8);
  });
  it("defaults to retain and accepts only explicit hide-previous-turn", () => {
    expect(getCompletedDisplay()).toBe("retain");
    put(own(), '{"completedDisplay":"bad"}'); expect(getCompletedDisplay()).toBe("retain");
    put(own(), '{"completedDisplay":"hide-previous-turn"}'); expect(getCompletedDisplay()).toBe("hide-previous-turn");
  });
});
