// Config is bundled as an asset and read at runtime — no models/languages are
// hardcoded in code (mirrors the qvac-spike rule). Everything tunable lives in
// assets/config.json; the football pack lives in assets/football-pack.json.
import cfgJson from "../assets/config.json";
import packJson from "../assets/football-pack.json";

export type Lang = { code: string; label: string; flag: string; rtl?: boolean };

export type Config = {
  device: string;
  models: Record<string, { const: string; type?: string; engine?: string; dim?: number; constTemplate?: string }>;
  lang: { source: string; target: string };
  audio: { asrSampleRate: number; ttsSampleRate: number };
  stream: {
    chunkMs: number; gapMs: number; vad: string; vadParams: Record<string, number>;
    asrThreads: number; ttsSpeed: number; ttsSteps: number; asrParams: Record<string, unknown>;
  };
  rag: { topK: number; minScore: number; queryPrefix: string; docPrefix: string };
  companion: {
    ctxSize: number; maxContextChars: number; systemPrompt: string; refusal: string;
    generationParams: Record<string, number>;
  };
  ui: { sourceFlag: string; languages: Lang[] };
  sample: { commentaryLines: string[]; exampleQuestions?: string[] };
};

export const cfg = cfgJson as unknown as Config;

export type PackEntry = { topic: string; text: string };
const rawPack = packJson as unknown as { entries?: PackEntry[] } | PackEntry[];
export const pack: PackEntry[] = (Array.isArray(rawPack) ? rawPack : rawPack.entries ?? [])
  .map((e) => ({ topic: String(e.topic || "").trim(), text: String(e.text || "").trim() }))
  .filter((e) => e.text);
