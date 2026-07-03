// Bare worklet entry — bridges React Native <-> room-core over BareKit IPC.
// Protocol: newline-delimited JSON both ways.
//   RN -> worklet: {op:"join", topic, name, lang, maxMessageBytes} | {op:"send", text} | {op:"leave"}
//   worklet -> RN: room-core events, plus {ev:"worklet-ready"} | {ev:"sent",...} | {ev:"left"} | {ev:"err", msg}
/* global BareKit */
"use strict";
const b4a = require("b4a");
const { createRoom } = require("./room-core");

const { IPC } = BareKit;
let room = null;
let buf = b4a.alloc(0);

function send(obj) {
  try { IPC.write(b4a.from(JSON.stringify(obj) + "\n")); } catch { /* host gone */ }
}

function handle(line) {
  let cmd;
  try { cmd = JSON.parse(line); } catch { return send({ ev: "err", msg: "bad json from host" }); }
  try {
    if (cmd.op === "join") {
      if (room) return send({ ev: "err", msg: "already joined" });
      room = createRoom(cmd, send);
    } else if (cmd.op === "send") {
      if (!room) return send({ ev: "err", msg: "not joined" });
      const echo = room.send(cmd.text);
      if (echo) send({ ev: "sent", ...echo });
    } else if (cmd.op === "leave") {
      const r = room;
      room = null;
      if (r) r.leave().then(() => send({ ev: "left" }));
    } else {
      send({ ev: "err", msg: "unknown op: " + String(cmd.op) });
    }
  } catch (e) {
    send({ ev: "err", msg: String((e && e.message) || e) });
  }
}

IPC.on("data", (chunk) => {
  buf = b4a.concat([buf, b4a.from(chunk)]);
  let i;
  while ((i = buf.indexOf(0x0a)) !== -1) {
    const line = b4a.toString(buf.subarray(0, i));
    buf = buf.subarray(i + 1);
    if (line.trim()) handle(line);
  }
});

send({ ev: "worklet-ready" });
