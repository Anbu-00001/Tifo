# TIFO — Expo/React Native port (Day 5)

Phone front-end for the offline matchday companion, on **Tether QVAC**. This turns the
`qvac-spike` proof (Node/web) into the real deployment target — a **phone app** — reusing the
exact same `@qvac/sdk` API.

## Why this port is low-risk (verified from primary sources)

The heavy risk — "does QVAC even work on a phone?" — is settled by the SDK itself:

- **On-device engines ship for phones.** `node_modules/@qvac/*/prebuilds` include `android-arm64`
  **and** `ios-arm64` for llamacpp (LLM), whispercpp (ASR) and embed-llamacpp (embeddings).
- **The RN API is identical to Node.** On React Native the SDK spawns a **Bare worklet**
  (`react-native-bare-kit`) running `@qvac/sdk/worker.mobile.bundle`, and the client transparently
  RPCs into it (`dist/client/rpc/expo-rpc-client.js`). So `loadModel / transcribeStream / translate /
  completion / embed / textToSpeech` are called **the same way** — our [src/qvac](src/qvac) code is a
  near-line-for-line port of the spike's `pipeline.js` / `companion.js` / `rag.js`.
- **The worklet is auto-generated.** `@qvac/sdk/expo-plugin` (`withMobileBundle`) builds the mobile
  worker bundle during `npx expo prebuild` — we don't hand-write or hand-bundle it.

## Requirements & run steps

> **QVAC does not run on emulators — use a physical device.** (Confirmed in the QVAC docs.)

```bash
cd tifo-app
npm install
npx expo install expo-file-system expo-build-properties expo-device expo-audio expo-asset expo-font \
  @expo-google-fonts/archivo @expo-google-fonts/jetbrains-mono react-native-bare-kit   # reconciles versions
npx expo prebuild                 # generates native projects + the QVAC worker bundle
npx expo run:android              # or run:ios — must target a real phone
```

`app.json` already wires the two required plugins:
```json
"plugins": [["expo-build-properties", { "android": { "minSdkVersion": 29 } }], "@qvac/sdk/expo-plugin"]
```

## What's config-driven (no hardcoded bits)
`assets/config.json` (copied from the spike) holds every model constant, language, VAD/ASR/RAG/companion
tunable; `assets/football-pack.json` is the retrieval corpus; `src/config.ts` loads them. The language
list, grounding threshold (0.84) and RTL come from `config.ui` — nothing model/language-specific is
hardcoded in `.ts`.

## Architecture
- [src/qvac/models.ts](src/qvac/models.ts) — `load/unload/predownload` (resolves model constants by name).
- [src/qvac/liveTranslate.ts](src/qvac/liveTranslate.ts) — streaming ASR→NMT→TTS generator (takes an `AudioSource`).
- [src/qvac/rag.ts](src/qvac/rag.ts) + [companion.ts](src/qvac/companion.ts) — embeddings + cosine, grounded/refusing Q&A.
- [src/audio/pcm.ts](src/audio/pcm.ts) — pure-JS WAV decode / resample-to-16k / f32le / WAV write (replaces ffmpeg).
- [src/audio/io.ts](src/audio/io.ts) — the **only** platform-specific audio glue (asset read + playback).
- [src/screens](src/screens) — Home / Live / Ask, ported 1:1 from the validated design (`TIFO.dc.html`).

## Verified vs. pending (honest status)
**Verified**
- The QVAC RN integration mechanism, from primary source (worklet + auto-bundle + identical API).
- The pure audio math in `pcm.ts` (WAV parse + 44.1k→16k resample + base64) — unit-tested in Node
  against the real `assets/commentary_en.wav` (see `qvac-spike/out` test log).
- The UI/UX is the same design already screenshot-validated on web.

**Pending (needs your physical phone + toolchain — I can't run a device or QVAC-on-emulator here)**
1. `npm install` + `npx expo install` version reconciliation (versions in `package.json` are best-guess
   for Expo SDK 54; `npx expo install` is the source of truth).
2. `tsc --noEmit` against the installed `@qvac/sdk` types (a few SDK call sites use `as` casts where the
   RN type surface is uncertain).
3. On-device `expo prebuild` + run, and confirming the two audio-glue calls in `io.ts`
   (`FileSystem.readAsStringAsync` base64, `createAudioPlayer`) against the installed Expo versions.

## Known open item — the microphone
`bundledClipSource` (the demo path) works today: it decodes a bundled commentary clip to f32le/16k in
pure JS and feeds `transcribeStream`. **Live mic** (`micSource`) is a documented stub — Expo records to a
file, not a live PCM stream, so it needs a raw-PCM native module (e.g. `react-native-live-audio-stream`
emitting base64 PCM16 → convert via `pcm16→f32`). That's the next on-device task; the demo/video uses the
bundled clip, exactly like the web spike used a synthesized commentary clip.
