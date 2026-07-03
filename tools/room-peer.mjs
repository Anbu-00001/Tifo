// Laptop peer for the TIFO match room — runs the IDENTICAL room-core the phone
// worklet runs, on plain Node. Usage (from tifo-app/):
//   node tools/room-peer.mjs --name Laptop --lang en [--topic <room>] [--say "text"] [--exit-after-ms N]
// Interactive: type a line + Enter to send. Ctrl-C to leave.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";

const require = createRequire(import.meta.url);
const { createRoom } = require("../worklet/room-core.js");

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cfg = JSON.parse(readFileSync(path.join(root, "assets", "config.json"), "utf8"));

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const name = arg("--name", "Laptop");
const lang = arg("--lang", cfg.lang.source);
const topic = arg("--topic", cfg.room.topic);
const sayOnPeer = arg("--say", null); // auto-send once the first peer appears (for scripted tests)
const exitAfterMs = Number(arg("--exit-after-ms", 0));
// "host:port[,host:port…]" — local/LAN DHT bootstrap (see room-bootstrap.mjs); default = config, then public DHT.
const bootstrap = (arg("--bootstrap", (cfg.room.bootstrap ?? []).join(",")) || "").split(",").map((s) => s.trim()).filter(Boolean);

const t0 = Date.now();
const log = (line) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${line}`);

let said = false; // --say fires once, on the first peer — re-saying per join spams multi-peer rooms
const room = createRoom({ topic, name, lang, maxMessageBytes: cfg.room.maxMessageBytes, bootstrap }, (e) => {
  switch (e.ev) {
    case "ready": log(`ready as ${e.name} (${e.lang}) key=${e.me} topic="${topic}"`); break;
    case "announced": log("announced on DHT"); break;
    case "flushed": log(`swarm flushed (${e.peers} peer${e.peers === 1 ? "" : "s"})`); break;
    case "peer":
      log(`PEER JOINED: ${e.name} (${e.lang}) key=${e.key} — ${e.peers} in room`);
      if (sayOnPeer && !said) {
        said = true;
        const echo = room.send(sayOnPeer);
        if (echo) log(`SENT: "${echo.text}"`);
      }
      break;
    case "peer-gone": log(`peer left: ${e.name ?? e.key} — ${e.peers} in room`); break;
    case "msg": log(`MSG from ${e.name} (${e.lang}): ${e.text}`); break;
    case "err": log(`ERROR: ${e.msg}`); break;
    default: break; // joining etc.
  }
});

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const echo = room.send(line);
  if (echo) log(`SENT: "${echo.text}"`);
});

async function bye() {
  log("leaving…");
  await room.leave();
  process.exit(0);
}
process.on("SIGINT", bye);
process.on("SIGTERM", bye);
if (exitAfterMs > 0) setTimeout(bye, exitAfterMs);
