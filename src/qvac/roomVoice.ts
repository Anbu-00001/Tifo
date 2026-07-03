// Voice output for the Fan room: speaks incoming (already-translated) messages
// in the user's language with on-device TTS. Playback is strictly serial — a
// burst of messages queues rather than overlapping audio.
import { cfg } from "../config";
import { load, unload, qvac } from "./models";
import { pcm16ToWavBytes, toInt16Pcm } from "../audio/pcm";
import { playWavAndWait } from "../audio/io";

const TTS_RATE = cfg.audio.ttsSampleRate;

// The multilingual TTS voice doesn't cover the source/hub language — the spike
// learned this and config carries a dedicated fallback voice for it.
function ttsModelFor(lang: string): { const: string; type?: string; engine?: string } {
  const useFallback = lang.toLowerCase() === cfg.lang.source.toLowerCase() && cfg.models.ttsEnFallback;
  return useFallback ? cfg.models.ttsEnFallback : cfg.models.tts;
}

// Promise-cached per language so bursts don't double-load the model.
const ttsIds = new Map<string, Promise<string>>();

function ttsModel(lang: string): Promise<string> {
  const l = lang.toLowerCase();
  let p = ttsIds.get(l);
  if (!p) {
    const m = ttsModelFor(l);
    p = load({
      constName: m.const, type: m.type,
      modelConfig: { ttsEngine: m.engine, language: l, ttsSpeed: cfg.stream.ttsSpeed, ttsNumInferenceSteps: cfg.stream.ttsSteps },
    });
    p.catch(() => ttsIds.delete(l));
    ttsIds.set(l, p);
  }
  return p;
}

async function collectPcm(res: unknown): Promise<Int16Array> {
  return toInt16Pcm(await (res as { buffer?: Promise<unknown> }).buffer);
}

// Serial speak queue: each call chains onto the last so audio never overlaps.
let queue: Promise<void> = Promise.resolve();

export function speak(text: string, lang: string): Promise<void> {
  const t = String(text || "").trim();
  if (!t) return queue;
  queue = queue.then(async () => {
    const modelId = await ttsModel(lang);
    const res = await qvac.textToSpeech({
      modelId, text: t, inputType: "text", stream: false,
    } as Parameters<typeof qvac.textToSpeech>[0]);
    const pcm = await collectPcm(res);
    if (pcm.length) await playWavAndWait(pcm16ToWavBytes(pcm, TTS_RATE, 1), TTS_RATE);
    else console.warn(`[roomVoice] TTS returned empty audio for lang=${lang}`);
  }).catch((e) => {
    // One failed utterance must not jam the queue — but say why it failed.
    console.warn(`[roomVoice] speak failed (lang=${lang}): ${(e as Error)?.message ?? e}`);
  });
  return queue;
}

export async function unloadRoomTts(): Promise<void> {
  const pending = [...ttsIds.values()];
  ttsIds.clear();
  for (const p of pending) {
    try { await unload(await p); } catch { /* was never loaded */ }
  }
}
