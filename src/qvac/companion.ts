// Offline grounded Q&A companion (RN). Mirrors the spike's companion.js: retrieve
// → refuse if weak → grounded LLM (streamed) → optional translate + speak.
import { cfg } from "../config";
import { load, unload, nmtConstFor, qvac } from "./models";
import { search, unloadEmbedder } from "./rag";
import { pcm16ToWavBytes } from "../audio/pcm";

const TTS_RATE = cfg.audio.ttsSampleRate;
const comp = cfg.companion;

let llmId: string | null = null;
const nmtIds = new Map<string, string>();
const ttsIds = new Map<string, string>();

async function llm(): Promise<string> {
  if (!llmId) llmId = await load({ constName: cfg.models.llm.const, type: cfg.models.llm.type, modelConfig: { ctx_size: comp.ctxSize } });
  return llmId;
}
async function nmt(source: string, target: string): Promise<string> {
  const key = `${source}->${target}`;
  if (nmtIds.has(key)) return nmtIds.get(key)!;
  const id = await load({ constName: nmtConstFor(source, target), type: cfg.models.nmt.type, modelConfig: { engine: cfg.models.nmt.engine, from: source, to: target } });
  nmtIds.set(key, id);
  return id;
}
async function tts(lang: string): Promise<string> {
  if (ttsIds.has(lang)) return ttsIds.get(lang)!;
  const id = await load({
    constName: cfg.models.tts.const, type: cfg.models.tts.type,
    modelConfig: { ttsEngine: cfg.models.tts.engine, language: lang, ttsSpeed: cfg.stream.ttsSpeed, ttsNumInferenceSteps: cfg.stream.ttsSteps },
  });
  ttsIds.set(lang, id);
  return id;
}

async function collectPcm(res: unknown): Promise<Int16Array> {
  const buf = await (res as { buffer?: Promise<Int16Array> }).buffer;
  return buf instanceof Int16Array ? buf : new Int16Array(0);
}
async function toText(res: unknown): Promise<string> {
  const t = (res as { text?: unknown }).text;
  if (t == null) return "";
  return typeof (t as { then?: unknown })?.then === "function" ? String(await t) : String(t);
}
function buildContext(hits: { topic: string; text: string }[]): string {
  let used = 0; const lines: string[] = [];
  for (const h of hits) {
    const line = `- ${h.topic}: ${h.text}`;
    if (used + line.length > comp.maxContextChars && lines.length) break;
    lines.push(line); used += line.length;
  }
  return lines.join("\n");
}

export type AskEvent =
  | { type: "status"; msg: string }
  | { type: "sources"; sources: { topic: string; score: number }[]; grounded: boolean }
  | { type: "token"; token: string }
  | { type: "answer"; text: string; grounded: boolean }
  | { type: "translated"; text: string; lang: string }
  | { type: "audio"; wav: Uint8Array }
  | { type: "done"; latMs: number; grounded: boolean };

export async function* askCompanion(opts: {
  question: string; source?: string; target?: string; speak?: boolean;
}): AsyncGenerator<AskEvent> {
  const source = opts.source ?? cfg.lang.source;
  const target = opts.target ?? source;
  const speak = opts.speak ?? true;
  const q = String(opts.question || "").trim();
  const t0 = Date.now();
  if (!q) { yield { type: "answer", text: "Ask me something about the match.", grounded: false }; yield { type: "done", latMs: 0, grounded: false }; return; }

  yield { type: "status", msg: "Searching the offline matchday pack…" };
  const hits = await search(q, cfg.rag.topK);
  const grounded = (hits[0]?.score ?? 0) >= cfg.rag.minScore;
  yield { type: "sources", sources: hits.map((h) => ({ topic: h.topic, score: Number(h.score.toFixed(3)) })), grounded };

  let answer: string;
  if (!grounded) {
    answer = comp.refusal;
    yield { type: "token", token: answer };
    yield { type: "answer", text: answer, grounded: false };
  } else {
    yield { type: "status", msg: "Answering from the pack (on-device LLM)…" };
    const history = [
      { role: "system", content: comp.systemPrompt },
      { role: "user", content: `CONTEXT:\n${buildContext(hits)}\n\nQUESTION: ${q}` },
    ];
    const result = qvac.completion({ modelId: await llm(), history, stream: true, generationParams: comp.generationParams } as Parameters<typeof qvac.completion>[0]) as { tokenStream: AsyncIterable<string | { text?: string }> };
    answer = "";
    for await (const token of result.tokenStream) {
      const piece = typeof token === "string" ? token : (token?.text ?? "");
      answer += piece;
      yield { type: "token", token: piece };
    }
    answer = answer.trim() || comp.refusal;
    yield { type: "answer", text: answer, grounded: true };
  }

  let spokenText = answer, spokenLang = source;
  if (target && target !== source) {
    yield { type: "status", msg: `Translating to ${target}…` };
    const tr = await qvac.translate({ modelId: await nmt(source, target), text: answer, stream: false, modelType: cfg.models.nmt.type } as Parameters<typeof qvac.translate>[0]);
    spokenText = (await toText(tr)).trim() || answer;
    spokenLang = target;
    yield { type: "translated", text: spokenText, lang: target };
  }

  if (speak) {
    yield { type: "status", msg: "Speaking…" };
    const ttsRes = await qvac.textToSpeech({ modelId: await tts(spokenLang), text: spokenText || "...", inputType: "text", stream: false } as Parameters<typeof qvac.textToSpeech>[0]);
    const pcm = await collectPcm(ttsRes);
    yield { type: "audio", wav: pcm16ToWavBytes(pcm, TTS_RATE, 1) };
  }

  yield { type: "done", latMs: Date.now() - t0, grounded };
}

export async function unloadCompanion(): Promise<void> {
  if (llmId) { await unload(llmId); llmId = null; }
  for (const id of nmtIds.values()) await unload(id);
  for (const id of ttsIds.values()) await unload(id);
  nmtIds.clear(); ttsIds.clear();
  await unloadEmbedder();
}
