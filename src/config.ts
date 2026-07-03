// Config is bundled as an asset and read at runtime — no models/languages are
// hardcoded in code (mirrors the qvac-spike rule). Everything tunable lives in
// assets/config.json.
import cfgJson from "../assets/config.json";

export type Lang = { code: string; label: string; flag: string; rtl?: boolean };

export type Config = {
  device: string;
  models: Record<string, { const: string; type?: string; engine?: string; dim?: number; constTemplate?: string; pivot?: string }>;
  lang: { source: string; target: string };
  audio: { asrSampleRate: number; ttsSampleRate: number };
  stream: {
    chunkMs: number; gapMs: number; vad: string; vadParams: Record<string, number>;
    asrThreads: number; ttsSpeed: number; ttsSteps: number; asrParams: Record<string, unknown>;
  };
  room: { topic: string; maxMessageBytes: number; bootstrap: string[]; speak?: boolean };
  ui: { sourceFlag: string; sourceLabel: string; languages: Lang[] };
  sample: { commentaryLines: string[] };
};

export const cfg = cfgJson as unknown as Config;
