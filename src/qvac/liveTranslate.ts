// Live offline commentary translation (RN). Mirrors the spike's pipeline.js but
// takes an AudioSource instead of ffmpeg, and uses the identical @qvac/sdk API.
import { cfg } from "../config";
import { load, unload, predownload, resolveModel, nmtConstFor, qvac } from "./models";
import { pcm16ToWavBytes } from "../audio/pcm";
import type { AudioSource } from "../audio/source";

const TTS_RATE = cfg.audio.ttsSampleRate;
const RATE = cfg.audio.asrSampleRate;

function isMeaningful(text: string): boolean {
  const t = (text || "").trim();
  if (!t || t.includes("[No speech detected]") || /^\[[^\]]+\]$/.test(t)) return false;
  return t.replace(/[^\p{L}\p{N}]/gu, "").length >= 3;
}
async function collectPcm(res: unknown): Promise<Int16Array> {
  const buf = await (res as { buffer?: Promise<Int16Array> }).buffer;
  if (buf instanceof Int16Array) return buf;
  if (ArrayBuffer.isView(buf)) return new Int16Array((buf as ArrayBufferView).buffer);
  return new Int16Array(0);
}
async function toText(res: unknown): Promise<string> {
  const t = (res as { text?: unknown }).text;
  if (t == null) return "";
  return typeof (t as { then?: unknown })?.then === "function" ? String(await t) : String(t);
}

export type LiveEvent =
  | { type: "status"; msg: string }
  | { type: "utterance"; src: string; tgt: string; latMs: number; wav: Uint8Array }
  | { type: "done"; count: number; avgLatMs: number };

export async function* liveTranslate(opts: {
  source?: string; target: string; audio: AudioSource;
}): AsyncGenerator<LiveEvent> {
  const source = opts.source ?? cfg.lang.source;
  const target = opts.target;

  yield { type: "status", msg: "Loading on-device models…" };
  await predownload(cfg.stream.vad);
  const vadDesc = resolveModel(cfg.stream.vad);
  const asrId = await load({
    constName: cfg.models.asr.const, type: cfg.models.asr.type,
    modelConfig: {
      vadModelSrc: vadDesc, audio_format: "f32le", n_threads: cfg.stream.asrThreads,
      language: source, vad_params: cfg.stream.vadParams, ...cfg.stream.asrParams,
    },
  });
  const nmtId = await load({ constName: nmtConstFor(source, target), type: cfg.models.nmt.type, modelConfig: { engine: cfg.models.nmt.engine, from: source, to: target } });
  const ttsId = await load({
    constName: cfg.models.tts.const, type: cfg.models.tts.type,
    modelConfig: { ttsEngine: cfg.models.tts.engine, language: target, ttsSpeed: cfg.stream.ttsSpeed, ttsNumInferenceSteps: cfg.stream.ttsSteps },
  });

  yield { type: "status", msg: `Live — ${source} → ${target}, 100% on-device, 0 KB sent` };
  const session = await qvac.transcribeStream({ modelId: asrId }) as {
    write: (b: Uint8Array) => void; end: () => void; [Symbol.asyncIterator]: () => AsyncIterator<string>;
  };

  // Feed the audio concurrently.
  (async () => {
    try { for await (const chunk of opts.audio.chunks(cfg.stream.chunkMs, RATE)) session.write(chunk); }
    catch { /* aborted */ }
    finally { try { session.end(); } catch { /* already closed */ } }
  })();

  const lat: number[] = [];
  for await (const raw of session) {
    if (!isMeaningful(raw)) continue;
    const t0 = Date.now();
    const src = raw.trim();
    const tr = await qvac.translate({ modelId: nmtId, text: src, stream: false, modelType: cfg.models.nmt.type } as Parameters<typeof qvac.translate>[0]);
    const tgt = (await toText(tr)).trim();
    const ttsRes = await qvac.textToSpeech({ modelId: ttsId, text: tgt || "...", inputType: "text", stream: false } as Parameters<typeof qvac.textToSpeech>[0]);
    const pcm = await collectPcm(ttsRes);
    const latMs = Date.now() - t0;
    lat.push(latMs);
    yield { type: "utterance", src, tgt, latMs, wav: pcm16ToWavBytes(pcm, TTS_RATE, 1) };
  }

  await unload(asrId); await unload(nmtId); await unload(ttsId);
  const avg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0;
  yield { type: "done", count: lat.length, avgLatMs: avg };
}
