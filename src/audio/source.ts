// An AudioSource yields f32le mono chunks at the ASR sample rate, ready to feed
// straight into transcribeStream. Two implementations:
//   • bundledClipSource — decodes a bundled WAV asset (guaranteed offline demo path)
//   • micSource         — live phone mic via expo-stream-audio (PCM16 frames → f32le)
import * as StreamAudio from "expo-stream-audio";
import { parseWav, toMonoF32, f32ToLEBytes, base64ToBytes, pcm16LEToF32 } from "./pcm";
import { readAssetBytes } from "./io";

export type AudioChunk = Uint8Array; // little-endian f32 PCM, mono, at sampleRate
export interface AudioSource {
  chunks(chunkMs: number, sampleRate: number): AsyncGenerator<AudioChunk>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Decode a bundled WAV once, then emit it in real-time-paced chunks — the phone
// equivalent of the spike's ffmpeg→f32le step, in pure JS. Guaranteed offline.
export function bundledClipSource(moduleRef: number, paced = true): AudioSource {
  return {
    async *chunks(chunkMs: number, sampleRate: number) {
      const bytes = await readAssetBytes(moduleRef);
      const f32 = toMonoF32(parseWav(bytes), sampleRate);
      const per = Math.floor((chunkMs / 1000) * sampleRate); // samples per chunk
      for (let off = 0; off < f32.length; off += per) {
        yield f32ToLEBytes(f32.subarray(off, off + per));
        if (paced) await sleep(chunkMs);
      }
    },
  };
}

// Live microphone via expo-stream-audio: native layer emits base64 PCM16 mono
// frames (~20ms cadence); we convert each to f32le for transcribeStream. The
// generator ends when the consumer calls .return() (its finally block stops the
// native stream) — frames arriving every ~20ms guarantee the pending await
// settles promptly, so teardown is quick.
export function micSource(): AudioSource {
  return {
    async *chunks(_chunkMs: number, sampleRate: number) {
      const queue: Uint8Array[] = [];
      let wake: (() => void) | null = null;
      let error: Error | null = null;
      const frameSub = StreamAudio.addFrameListener((e) => {
        queue.push(f32ToLEBytes(pcm16LEToF32(base64ToBytes(e.pcmBase64))));
        wake?.();
      });
      const errSub = StreamAudio.addErrorListener((e) => {
        error = new Error(e.message || "mic stream error");
        wake?.();
      });
      try {
        await StreamAudio.start({ sampleRate: sampleRate as 16000 });
        while (true) {
          while (queue.length) yield queue.shift()!;
          if (error) throw error;
          await new Promise<void>((r) => { wake = r; });
          wake = null;
        }
      } finally {
        frameSub.remove();
        errSub.remove();
        try { await StreamAudio.stop(); } catch { /* already stopped */ }
      }
    },
  };
}
