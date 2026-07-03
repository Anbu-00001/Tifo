// Local DHT for the match room — makes the room work with ZERO internet
// (airplane-mode LAN demo) and fixes same-NAT peer discovery during dev.
//
// A single bootstrap node is NOT enough: hyperdht announces need multiple
// storage nodes or the commit fails with "Too few nodes responded" (which
// hyperswarm safety-catches, so peers just silently never find each other).
// hyperdht ships a testnet helper for exactly this; we run a small one.
//
// Usage (from tifo-app/):
//   node tools/room-bootstrap.mjs [--port 49737] [--size 6] [--host <LAN-IP>]
// Then point peers at <LAN-IP>:<port> (peer --bootstrap flag / app config
// room.bootstrap).
import { createRequire } from "node:module";
import os from "node:os";

const require = createRequire(import.meta.url);
const createTestnet = require("hyperdht/testnet");

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

function lanIPv4() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return "127.0.0.1";
}

const port = Number(arg("--port", 49737));
const size = Number(arg("--size", 6));
const host = arg("--host", lanIPv4());

const testnet = await createTestnet(size, { host, port });
const [b] = testnet.bootstrap;
console.log(`local DHT up: ${size} nodes, bootstrap ${b.host}:${b.port}`);
console.log(`  laptop peer:  node tools/room-peer.mjs --bootstrap ${b.host}:${b.port} …`);
console.log(`  phone config: "room": { "bootstrap": ["${b.host}:${b.port}"] }`);
console.log("Ctrl-C to stop.");

process.on("SIGINT", async () => { await testnet.destroy(); process.exit(0); });
