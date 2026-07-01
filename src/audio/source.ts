// An AudioSource yields f32le mono chunks at the ASR sample rate, ready to feed
// straight into transcribeStream. Two implementations:
//   • bundledClipSource — decodes a bundled WAV asset (works today; the demo path)
//   • micSource         — live phone mic (needs a raw-PCM native module; see PORTING.md)
import { parseWav, toMonoF32, f32ToLEBytes } from "./pcm";
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

// Live microphone. QVAC wants continuous f32le mono @ sampleRate. Expo's built-in
// audio records to a file, not a live PCM stream, so this needs a raw-PCM module
// (e.g. react-native-live-audio-stream emitting base64 PCM16 chunks, which we'd
// convert via pcm16→f32). Wired on-device in a follow-up — see PORTING.md.
export function micSource(): AudioSource {
  return {
    // eslint-disable-next-line require-yield
    async *chunks() {
      throw new Error(
        "micSource is not wired yet — install a raw-PCM stream module and convert PCM16→f32le (see PORTING.md). Use bundledClipSource for the demo."
      );
    },
  };
}
