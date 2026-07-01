// Offline RAG: QVAC embeddings + in-memory cosine over the bundled football pack.
// Same approach as the spike; built once per app session (small pack).
import { cfg, pack } from "../config";
import { load, unload, qvac } from "./models";

let embedderId: string | null = null;
type Item = { topic: string; text: string; vec: Float32Array };
let index: Item[] | null = null;

function normalize(v: number[] | Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}
const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

async function embedder(): Promise<string> {
  if (!embedderId) embedderId = await load({ constName: cfg.models.embed.const });
  return embedderId;
}

async function embedText(text: string | string[]): Promise<number[] | number[][]> {
  const id = await embedder();
  const res = await qvac.embed({ modelId: id, text } as Parameters<typeof qvac.embed>[0]);
  return (res as { embedding: number[] | number[][] }).embedding;
}

export async function ensureIndex(onProgress?: (done: number, total: number) => void): Promise<void> {
  if (index) return;
  const docs = pack.map((d) => `${cfg.rag.docPrefix}${d.topic ? d.topic + ". " : ""}${d.text}`);
  const built: Item[] = [];
  const B = 16;
  for (let i = 0; i < docs.length; i += B) {
    const slice = docs.slice(i, i + B);
    const emb = (await embedText(slice)) as number[][];
    const rows = Array.isArray(emb[0]) ? emb : [emb as unknown as number[]];
    rows.forEach((r, j) => built.push({ topic: pack[i + j].topic, text: pack[i + j].text, vec: normalize(r) }));
    onProgress?.(Math.min(i + slice.length, docs.length), docs.length);
  }
  index = built;
}

export type Hit = { topic: string; text: string; score: number };
export async function search(query: string, k = cfg.rag.topK): Promise<Hit[]> {
  await ensureIndex();
  const q = normalize((await embedText(`${cfg.rag.queryPrefix}${query}`)) as number[]);
  return index!
    .map((it) => ({ topic: it.topic, text: it.text, score: dot(q, it.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export async function unloadEmbedder(): Promise<void> {
  if (embedderId) { await unload(embedderId); embedderId = null; }
}
