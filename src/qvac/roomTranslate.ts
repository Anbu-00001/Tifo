// Per-receiver translation of Fan-room messages. Every message arrives with the
// sender's language; THIS device translates it into its user's language with
// on-device Bergamot NMT.
//
// Routing (verified against the installed SDK: all 101 Bergamot pairs involve
// the hub language, none are direct X→Y): same lang → passthrough; hub→X or
// X→hub → one hop; X→Y → two hops via the hub. The hub is config
// (models.nmt.pivot), not hardcoded.
import { cfg } from "../config";
import { load, unload, nmtConstIfExists, qvac } from "./models";

const pivot = (cfg.models.nmt.pivot ?? "en").toLowerCase();

export type Hop = { from: string; to: string };

// null = untranslatable with the models the SDK ships; [] = same language.
export function routeFor(src: string, tgt: string): Hop[] | null {
  const s = src.toLowerCase(), t = tgt.toLowerCase();
  if (!s || !t || s === t) return [];
  if (nmtConstIfExists(s, t)) return [{ from: s, to: t }];
  if (s !== pivot && t !== pivot && nmtConstIfExists(s, pivot) && nmtConstIfExists(pivot, t)) {
    return [{ from: s, to: pivot }, { from: pivot, to: t }];
  }
  return null;
}

// A language is room-capable if it can reach and be reached by every other
// room-capable language, i.e. it is the hub or has both hops to/from it.
export function isRoomLang(lang: string): boolean {
  const l = lang.toLowerCase();
  return l === pivot || (nmtConstIfExists(l, pivot) !== null && nmtConstIfExists(pivot, l) !== null);
}

// Model handles cached per pair as PROMISES so two messages arriving together
// don't double-load the same ~30MB model.
const pairIds = new Map<string, Promise<string>>();

function pairModel(hop: Hop): Promise<string> {
  const key = `${hop.from}->${hop.to}`;
  let p = pairIds.get(key);
  if (!p) {
    const constName = nmtConstIfExists(hop.from, hop.to);
    if (!constName) return Promise.reject(new Error(`no NMT model for ${key}`));
    p = load({
      constName, type: cfg.models.nmt.type,
      modelConfig: { engine: cfg.models.nmt.engine, from: hop.from, to: hop.to },
    });
    p.catch(() => pairIds.delete(key)); // failed load shouldn't poison the cache
    pairIds.set(key, p);
  }
  return p;
}

async function toText(res: unknown): Promise<string> {
  const t = (res as { text?: unknown }).text;
  if (t == null) return "";
  return typeof (t as { then?: unknown })?.then === "function" ? String(await t) : String(t);
}

// ms counts only the translate calls (summed across hops), not model
// load/download — so the first message after a cold start doesn't report a
// 30MB download as "translation latency".
export type Translated = { text: string; route: Hop[]; ms: number };

// Resolves null when the pair is unroutable (caller shows the original).
// Throws only on runtime failure (load/translate) so callers can distinguish.
export async function translateForRoom(text: string, src: string, tgt: string): Promise<Translated | null> {
  const route = routeFor(src, tgt);
  if (route === null) return null;
  let out = text;
  let ms = 0;
  for (const hop of route) {
    const modelId = await pairModel(hop);
    const t0 = Date.now();
    const res = await qvac.translate({
      modelId, text: out, stream: false, modelType: cfg.models.nmt.type,
    } as Parameters<typeof qvac.translate>[0]);
    const translated = (await toText(res)).trim();
    ms += Date.now() - t0;
    out = translated || out;
  }
  return { text: out, route, ms };
}

export async function unloadRoomNmt(): Promise<void> {
  const pending = [...pairIds.values()];
  pairIds.clear();
  for (const p of pending) {
    try { await unload(await p); } catch { /* was never loaded */ }
  }
}
