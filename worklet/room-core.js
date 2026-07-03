// Shared P2P match-room logic. Runs UNCHANGED on Bare (phone worklet) and Node
// (laptop peer) — hyperswarm/sodium/b4a all resolve on both runtimes, which is
// the "same code, any device" point. Topology: fully-connected swarm — every
// peer discovers the room topic on the DHT and connects to every other peer;
// messages are written directly to each live connection (no relay, no server,
// so no dedup or ordering machinery is needed at this scale).
"use strict";
const Hyperswarm = require("hyperswarm");
const sodium = require("sodium-universal");
const b4a = require("b4a");

const NL = 0x0a;

// A room name is any human string; the swarm needs a 32-byte topic.
function topicKey(topic) {
  const out = b4a.alloc(32);
  sodium.crypto_generichash(out, b4a.from(String(topic)));
  return out;
}

// opts: { topic, name, lang, maxMessageBytes, bootstrap } — all config-driven by
// callers. `bootstrap` is an optional array of "host:port" DHT bootstrap nodes;
// empty/absent means the public Hyperswarm DHT. Pointing it at a local node
// (tools/room-bootstrap.mjs) makes the room work on a LAN with ZERO internet —
// and sidesteps same-NAT hairpinning, which silently breaks same-network peers
// on the public DHT.
// onEvent receives plain objects: joining/ready/announced/flushed/peer/peer-gone/msg/err.
function createRoom(opts, onEvent) {
  const topic = String(opts.topic || "tifo-room");
  const name = String(opts.name || "fan").slice(0, 40);
  const lang = String(opts.lang || "en").slice(0, 8);
  const maxBytes = Number(opts.maxMessageBytes) > 0 ? Number(opts.maxMessageBytes) : 4096;
  const bootstrap = Array.isArray(opts.bootstrap) && opts.bootstrap.length > 0 ? opts.bootstrap : undefined;

  const swarm = new Hyperswarm(bootstrap ? { bootstrap } : {});
  const peers = new Map(); // conn -> { key, name, lang, buf, hello }
  let seq = 0;
  let destroyed = false;

  const emit = (ev) => {
    if (destroyed) return;
    try { onEvent(ev); } catch { /* host callback must never kill the room */ }
  };
  const sendLine = (conn, obj) => {
    try { conn.write(b4a.from(JSON.stringify(obj) + "\n")); } catch { /* conn dying; close handles it */ }
  };
  const countPeers = () => {
    let n = 0;
    for (const p of peers.values()) if (p.hello) n++;
    return n;
  };

  function handleLine(peer, line) {
    if (line.length > maxBytes) return;
    let m;
    try { m = JSON.parse(line); } catch { return; }
    if (m.t === "hello" && !peer.hello) {
      peer.hello = true;
      peer.name = String(m.name || "fan").slice(0, 40);
      peer.lang = String(m.lang || "??").slice(0, 8);
      emit({ ev: "peer", key: peer.key, name: peer.name, lang: peer.lang, peers: countPeers() });
    } else if (m.t === "msg" && peer.hello) {
      emit({
        ev: "msg", key: peer.key, name: peer.name, lang: String(m.lang || peer.lang).slice(0, 8),
        text: String(m.text || "").slice(0, maxBytes), ts: Number(m.ts) || Date.now(), id: String(m.id || ""),
      });
    }
  }

  swarm.on("connection", (conn, info) => {
    const peer = { key: b4a.toString(info.publicKey, "hex").slice(0, 8), name: null, lang: null, buf: b4a.alloc(0), hello: false };
    peers.set(conn, peer);

    conn.on("error", () => { /* surfaces as close */ });
    conn.on("close", () => {
      peers.delete(conn);
      if (peer.hello) emit({ ev: "peer-gone", key: peer.key, name: peer.name, peers: countPeers() });
    });
    conn.on("data", (chunk) => {
      peer.buf = b4a.concat([peer.buf, chunk]);
      if (peer.buf.byteLength > maxBytes * 8) { conn.destroy(); return; } // flood guard
      let i;
      while ((i = peer.buf.indexOf(NL)) !== -1) {
        const line = b4a.toString(peer.buf.subarray(0, i));
        peer.buf = peer.buf.subarray(i + 1);
        handleLine(peer, line);
      }
    });

    sendLine(conn, { t: "hello", name, lang });
  });

  emit({ ev: "joining", topic });
  emit({ ev: "ready", me: b4a.toString(swarm.keyPair.publicKey, "hex").slice(0, 8), name, lang });
  const discovery = swarm.join(topicKey(topic), { server: true, client: true });
  discovery.flushed().then(() => emit({ ev: "announced" })).catch((e) => emit({ ev: "err", msg: "announce: " + String(e && e.message || e) }));
  swarm.flush().then(() => emit({ ev: "flushed", peers: countPeers() })).catch(() => { /* transient; connections still arrive via events */ });

  // Hyperswarm only re-queries a topic every 10–12 min (REFRESH_INTERVAL), so
  // two fans who open the room at the same moment would miss each other for
  // minutes. While the room is empty, re-query fast; once anyone connects,
  // stand down (later joiners find our standing announce on their first lookup).
  const requery = setInterval(() => {
    if (destroyed || swarm.connections.size > 0) return;
    discovery.refresh({ client: true, server: true }).catch(() => { /* retried next tick */ });
  }, 4000);

  return {
    send(text) {
      const t = String(text || "").trim().slice(0, maxBytes);
      if (!t || destroyed) return null;
      const msg = { t: "msg", id: String(seq++), ts: Date.now(), lang, text: t };
      for (const [conn, p] of peers) if (p.hello) sendLine(conn, msg);
      return { id: msg.id, ts: msg.ts, lang, text: t, name, self: true };
    },
    async leave() {
      destroyed = true;
      clearInterval(requery);
      try { await swarm.destroy(); } catch { /* already down */ }
    },
  };
}

module.exports = { createRoom, topicKey };
