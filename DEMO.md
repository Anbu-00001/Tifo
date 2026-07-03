# TIFO — demo runbook

The demo: fans on the same WiFi/hotspot join a **serverless match room**; each writes in
their own language and reads everyone else in theirs — AI translation on-device (QVAC/
Bergamot), transport peer-to-peer (Pears/Hyperswarm). No account, no server, no cloud.

## Golden rule: start things in this order
1. **Local DHT first** (laptop): `node tools/room-bootstrap.mjs --port 49737 --host <laptop-LAN-IP>`
   — wait for "local DHT up".
2. **Laptop peer(s)**: `node tools/room-peer.mjs --name Laptop --lang en` (interactive: type
   a line + Enter to send; `--say "…"` auto-sends when the first peer joins).
3. **Phone(s)**: open TIFO → Fan room → pick a language.

Starting a peer while the DHT is down makes its announce fail *silently*; it recovers via
the room's re-query loop but that can take a minute. Healthy sequencing connects in ~1–5 s.

`assets/config.json → room.bootstrap` must hold the laptop's LAN IP:port. Set it to `[]`
to use the public Hyperswarm DHT instead (note: two devices behind the SAME router won't
find each other on the public DHT — NAT hairpinning — which is exactly why the local DHT
exists).

## Pre-warm (do both before filming)
- **Models:** join the room once per language you'll demo and receive one message — the
  ~30 MB Bergamot model(s) download and cache (`en↔xx`; non-English pairs pivot via EN and
  cache two). After that, translation needs zero network.
- **Room:** open the Fan room once a few minutes before the take; first-ever discovery on
  a fresh app process can be slow, re-joins are seconds.

## The airplane-mode / zero-internet shot
Everything in the loop is offline-capable once pre-warmed: local DHT (LAN-only) + cached
models. To make it theatrical:
1. Pre-warm as above (needs internet ONCE for model download).
2. Kill the internet, keep the LAN: turn off the router's WAN uplink, **or** run a hotspot
   with no upstream (laptop hotspot, or a phone hotspot with mobile data OFF).
3. Reconnect laptop + phones to that LAN; restart the DHT + peers (golden order).
4. Film: messages flow and translate with the status bar showing no internet.

## Filming checklist (the shots that matter)
- Home: "0 servers · 100% on-device" badge + Fan room hero card.
- Language pick: chips including Devanagari/Arabic rendering.
- The money shot: one phone in 🇪🇸/🇮🇳, laptop speaking English, bubble arriving with
  `en → es · on-device` meta, original underneath — then a **French** peer message showing
  `fr → es · via en · on-device` (the two-hop on-device pivot).
- Peers strip ("N in room · pills") as a third device joins.
- Reply from the phone reaching both terminals.

## Troubleshooting
- **Bootstrap binds 49738 instead of 49737** → something (often a stale `room-peer.mjs`)
  holds the port: `ss -ulpn | grep 49737`, kill it, restart the bootstrap.
- **Peers never connect** → check the golden order; verify phone and laptop share the LAN
  (`adb shell ip -4 addr show wlan0`); confirm config bootstrap IP matches the laptop.
- **Metro serves stale JS** → `curl -s localhost:8081/index.bundle?platform=android | grep <token>`
  before trusting a run; restart Metro if in doubt.
- **Phone via WiFi adb** (USB cable is charge-only): phone Settings → Developer options →
  Wireless debugging → pair; then `adb pair IP:port CODE`. `adb reverse tcp:8081 tcp:8081`
  works over WiFi adb.
