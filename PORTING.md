# TIFO — Expo/React Native app

Phone front-end for TIFO on **Tether QVAC** (on-device AI) + **Pears/Hyperswarm** (P2P fan
room). Started as a port of the `qvac-spike` proof (Node/web) onto the real deployment
target — a phone — reusing the exact same `@qvac/sdk` API, then extended with a serverless
P2P match room running in its own Bare worklet.

## Why the QVAC port is low-risk (verified from primary sources)

- **On-device engines ship for phones.** `node_modules/@qvac/*/prebuilds` include `android-arm64`
  **and** `ios-arm64` for llamacpp (LLM), whispercpp (ASR) and embed-llamacpp (embeddings).
- **The RN API is identical to Node.** On React Native the SDK spawns a **Bare worklet**
  (`react-native-bare-kit`) running `@qvac/sdk/worker.mobile.bundle`, and the client transparently
  RPCs into it (`dist/client/rpc/expo-rpc-client.js`). So `loadModel / transcribeStream / translate /
  textToSpeech` are called **the same way** — our [src/qvac](src/qvac) code is a near-line-for-line
  port of the spike's `pipeline.js`.
- **The worklet is auto-generated.** `@qvac/sdk/expo-plugin` (`withMobileBundle`) builds the mobile
  worker bundle during `npx expo prebuild` — we don't hand-write or hand-bundle it.

## Requirements & run steps

> **QVAC does not run on emulators — use a physical device.** (Confirmed in the QVAC docs.)

```bash
cd tifo-app
npm install
npx expo prebuild                 # generates native projects + the QVAC worker bundle
npx expo run:android              # or run:ios — must target a real phone
npm run bundle:room               # regenerate the Fan-room worklet bundle after editing worklet/*.js
```

`app.json` already wires the required plugins:
```json
"plugins": [["expo-build-properties", { "android": { "minSdkVersion": 29 } }], "@qvac/sdk/expo-plugin"]
```

## What's config-driven (no hardcoded bits)
`assets/config.json` holds every model constant, language, VAD/ASR tunable, and the room settings
(`room.topic`, `room.maxMessageBytes`, `room.bootstrap`); `src/config.ts` loads it. The language list
and RTL flags come from `config.ui` — nothing model/language-specific is hardcoded in `.ts`.
`room.bootstrap: []` uses the public Hyperswarm DHT; set `["<LAN-IP>:49737"]` to use a local DHT
(`tools/room-bootstrap.mjs`) for the zero-internet LAN demo.

## Architecture
- [src/qvac/models.ts](src/qvac/models.ts) — `load/unload/predownload` (resolves model constants by name).
- [src/qvac/liveTranslate.ts](src/qvac/liveTranslate.ts) — streaming ASR→NMT→TTS generator (takes an `AudioSource`).
- [src/audio/pcm.ts](src/audio/pcm.ts) — pure-JS WAV decode / resample-to-16k / f32le / WAV write (replaces ffmpeg).
- [src/audio/io.ts](src/audio/io.ts) — the **only** platform-specific audio glue (asset read + playback).
- [worklet/room-core.js](worklet/room-core.js) — the P2P room (Hyperswarm join, hello handshake with
  name+lang, newline-JSON wire, flood guard). **Runs unchanged on Bare (phone) and Node (laptop).**
- [worklet/room.js](worklet/room.js) — Bare worklet entry: bridges RN ↔ room-core over `BareKit.IPC`.
- [src/mesh/room.ts](src/mesh/room.ts) — RN bridge (`new Worklet()` + the generated
  `src/mesh/room.bundle.js`, built by `npm run bundle:room` via bare-pack `--linked --host android-arm64`).
- [tools/room-peer.mjs](tools/room-peer.mjs) / [tools/room-bootstrap.mjs](tools/room-bootstrap.mjs) —
  laptop peer (same room-core) and a 6-node local DHT for LAN/offline demos.
- [src/screens](src/screens) — Home / Live / Room, in the validated design (`TIFO.dc.html`).

The former grounded Q&A companion (embedder + LLM RAG) was removed after Day-6 on-device testing:
the two models co-resident OOM a 4 GB phone (QVAC `unloadModel` does not promptly free native RAM).
It lives on in git history and in `qvac-spike/` where it runs fully on Node/web.

## Hyperswarm lessons learned (each cost real debugging)
1. **Simultaneous joiners** miss each other for 10–12 min (hyperswarm topic refresh interval) —
   room-core re-queries every 4 s while it has zero connections, then stands down.
2. **A single local DHT bootstrap node cannot work** — announces need a storage quorum or dht-rpc
   fails ("Too few nodes responded") and hyperswarm swallows the error silently. `room-bootstrap.mjs`
   therefore runs a small local **testnet** (hyperdht's own pattern).
3. **Two peers behind the same NAT** silently fail to connect over the public DHT (hairpinning);
   the local bootstrap sidesteps this and doubles as the airplane-mode demo architecture.

## Verified on-device (OPPO CPH2591, 4 GB, Android 15)
- Build, install, RN JS via Metro; QVAC worklet boots; P2P model download (Hyperswarm) works.
- Live-translation pipeline pieces (ASR/NMT/TTS ≈ 240 MB) fit the 4 GB device.
- **Fan room end-to-end:** phone joined the room in ~4.5 s via its own Bare worklet over a local
  DHT, exchanged messages bidirectionally with a Node laptop peer (names + languages intact),
  clean leave/rejoin. The room bundle's four native addons (udx-native, sodium-native,
  bare-inspect, bare-type) are already linked into the APK by QVAC's addons manifest — the room
  ships as pure JS over Metro, no native rebuild.

## Known open items
- **Live mic** (`micSource`) is a documented stub — the plan is `expo-stream-audio`
  (PCM16 base64 frames @16 kHz → `pcm16→f32` → `transcribeStream`). The demo path uses the
  bundled commentary clip, exactly like the web spike.
- **Room message translation** (Day 3–4): translate incoming messages on the receiver with
  Bergamot using the sender's `lang` field; language picker on the Room screen.
- RoomScreen uses a fixed bottom padding to clear the Android nav bar; swap for
  `react-native-safe-area-context` on the UX pass.
