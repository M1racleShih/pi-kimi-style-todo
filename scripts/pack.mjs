import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runTerminal } from "./tui.mjs";

assert.equal(process.env.KIMI_TEST_ISOLATED, "1");
const root = fileURLToPath(new URL("../", import.meta.url));
const sandbox = process.env.KIMI_TEST_SANDBOX;
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const upstream = JSON.parse(readFileSync(join(root, "UPSTREAM.json"), "utf8"));
const sha256 = path => createHash("sha256").update(readFileSync(path)).digest("hex");
function command(executable, args, cwd = root, env = process.env) {
  const result = spawnSync(executable, args, { cwd, env, encoding: "utf8", timeout: 120000 });
  assert.equal(result.status, 0, `${executable} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
for (const group of ["dependencies", "devDependencies"]) {
  for (const [name, version] of Object.entries(manifest[group])) assert(/^\d+\.\d+\.\d+$/.test(version), `${name} is not pinned`);
}
for (const name of ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"]) {
  assert.equal(manifest.peerDependencies[name], "*"); assert(!manifest.dependencies[name]);
}
const unchanged = ["state/invariants.ts", "state/replay.ts", "state/selectors.ts", "state/state-reducer.ts", "state/state.ts", "state/store.ts", "state/task-graph.ts", "tool/response-envelope.ts", "tool/sanitize.ts", "tool/types.ts", "tool/normalize-params.ts"];
assert.deepEqual(upstream.importStatus.kernelFiles, unchanged);
assert.equal(upstream.npm.gitHead, upstream.upstream.commit);
for (const path of unchanged) {
  const source = upstream.importStatus.files.find(file => file.localPath === path);
  assert.equal(source?.commit, upstream.upstream.commit, `${path}: kernel source is not at the current pin`);
  assert.equal(sha256(join(root, path)), source.sha256, `${path}: unexpected kernel/protocol modification`);
}
assert.equal(sha256(join(root, "licenses/rpiv-todo-MIT.txt")), upstream.verifiedUpstreamFiles.LICENSE.sha256);
const dry = JSON.parse(command("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"]))[0];
const paths = dry.files.map(file => file.path).sort();
for (const path of ["index.ts", "todo.ts", "todo-overlay.ts", "view/layout.ts", "view/todo-list.ts", "LICENSE", "licenses/rpiv-todo-MIT.txt", "UPSTREAM.json", "THIRD_PARTY_NOTICES.md", "docs/preview.svg"]) assert(paths.includes(path), `Missing ${path}`);
for (const path of paths) {
  assert(!/(^|\/)(\.git|\.test|scripts|node_modules|coverage|planning|sessions)(\/|$)|\.test\.ts$|style-reference|package-lock|AGENTS\.md/.test(path), `Unexpected distribution file: ${path}`);
  const content = readFileSync(join(root, path), "utf8");
  assert(!/\/home\/shq|pi-kimi-style-todo-planning|style-reference\.png|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/.test(content), `Private content in ${path}`);
}
assert(manifest.keywords.includes("pi-package")); assert.deepEqual(manifest.pi.extensions, ["./index.ts"]);
const actual = JSON.parse(command("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", sandbox]))[0];
assert.deepEqual(actual.files.map(file => file.path).sort(), paths);
const tarball = join(sandbox, actual.filename);
const install = join(sandbox, "installed"); mkdirSync(install, { recursive: true });
writeFileSync(join(install, "package.json"), '{"name":"synthetic-package-consumer","private":true}');
command("npm", ["install", "--ignore-scripts", "--omit=dev", "--legacy-peer-deps", "--no-audit", "--no-fund", tarball], install);
const installed = join(install, "node_modules", manifest.name);
const require = createRequire(join(installed, "package.json"));
for (const name of ["@juicesharp/rpiv-i18n", "@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "@earendil-works/pi-tui"]) assert.throws(() => require.resolve(name), `${name} should be provided by host, not installed/bundled`);
const loaded = command(process.execPath, ["--import", join(root, "scripts/network-guard.mjs"), "--import", "tsx", join(root, "scripts/load.ts")], root, { ...process.env, KIMI_EXTENSION_PATH: installed });
assert(loaded.includes("PASS real Pi RPC"));
for (const mode of ["regular", "fullscreen"]) console.log(await runTerminal(mode, { packedPath: installed, smokeOnly: true }));
console.log(`PASS pack: ${paths.length} reviewed files, ${actual.size} compressed bytes; isolated install, no bundled Pi/i18n, resource/CLI/PTYS pass`);
