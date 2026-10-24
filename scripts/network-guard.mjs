// Tests run offline in addition to this fail-closed network boundary.
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";
import { writeFileSync } from "node:fs";

if (process.env.KIMI_TEST_ISOLATED !== "1") throw new Error("Network guard is test-only");
let attempts = 0;
function blocked() { attempts++; throw new Error("Network access forbidden in synthetic TODO tests"); }
// tsx probes its parent's local UNIX pipe even when run as a Node loader.
// That is IPC, not network: allow only this exact pipe shape, never TCP/UDP.
const allowLoaderPipe = original => function (...args) {
  const option = Array.isArray(args[0]) ? args[0][0] : args[0];
  const path = typeof option === "string" ? option : option?.path;
  if (typeof path === "string" && /^\/tmp\/tsx-\d+\/\d+\.pipe$/.test(path)) return original.apply(this, args);
  return blocked();
};
net.Socket.prototype.connect = allowLoaderPipe(net.Socket.prototype.connect);
net.connect = allowLoaderPipe(net.connect); net.createConnection = allowLoaderPipe(net.createConnection);
tls.connect = blocked;
http.request = blocked; http.get = blocked;
https.request = blocked; https.get = blocked;
dgram.createSocket = blocked;
globalThis.fetch = async () => blocked();
syncBuiltinESMExports();
process.on("exit", () => {
  if (process.env.KIMI_NETWORK_REPORT) writeFileSync(`${process.env.KIMI_NETWORK_REPORT}-${process.pid}.json`, JSON.stringify({ attempts }));
  if (attempts) { console.error(`Forbidden network attempts: ${attempts}`); process.exitCode = 1; }
});
