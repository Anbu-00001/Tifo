// QVAC model helpers for React Native. The @qvac/sdk API is IDENTICAL to Node —
// the only difference is that on RN these calls transparently RPC into the Bare
// worklet the expo-plugin bundles (see PORTING.md). Nothing about models or
// languages is hardcoded here; callers pass constant NAMES from config.
import * as qvac from "@qvac/sdk";
import { cfg } from "../config";

// The SDK exports model descriptors as named constants (e.g. LLAMA_3_2_1B_INST_Q4_0).
// Resolve one by its config name without hardcoding any specific model.
export function resolveModel(constName: string): unknown {
  const desc = (qvac as unknown as Record<string, unknown>)[constName];
  if (!desc) throw new Error(`Model constant "${constName}" is not exported by @qvac/sdk (check config / version).`);
  return desc;
}

// Resolve the NMT model constant for a language pair from a config-driven template
// (default "BERGAMOT_${SRC}_${TGT}"), falling back to cfg.models.nmt.const.
export function nmtConstFor(source: string, target: string): string {
  const tmpl = cfg.models.nmt.constTemplate || "BERGAMOT_${SRC}_${TGT}";
  const guess = tmpl.replace("${SRC}", source.toUpperCase()).replace("${TGT}", target.toUpperCase());
  return guess in (qvac as Record<string, unknown>) ? guess : cfg.models.nmt.const;
}

type Progress = { percentage?: number; downloaded?: number; total?: number };
type LoadArgs = { constName: string; type?: string; modelConfig?: Record<string, unknown>; onProgress?: (p: Progress) => void };

// Pre-download (resumable, no inference timeout). Safe when already cached.
export async function predownload(constName: string, onProgress?: (p: Progress) => void, retries = 8): Promise<void> {
  const assetSrc = resolveModel(constName);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await qvac.downloadAsset({ assetSrc, onProgress } as unknown as Parameters<typeof qvac.downloadAsset>[0]);
      return;
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, Math.min(30000, 3000 * attempt)));
    }
  }
}

// Load a model; returns its modelId string. Omits modelType for embedders
// (the SDK auto-detects them). Pre-downloads first so the big blob never trips
// loadModel's per-request timeout.
export async function load({ constName, type, modelConfig, onProgress }: LoadArgs): Promise<string> {
  const modelSrc = resolveModel(constName);
  await predownload(constName, onProgress);
  const loaded = await qvac.loadModel({
    modelSrc,
    ...(type ? { modelType: type } : {}),
    ...(modelConfig ? { modelConfig } : {}),
    onProgress,
  } as unknown as Parameters<typeof qvac.loadModel>[0]);
  const modelId = typeof loaded === "string" ? loaded : (loaded as { modelId?: string })?.modelId;
  if (!modelId) throw new Error(`loadModel(${constName}) returned no modelId`);
  return modelId;
}

export async function unload(modelId?: string): Promise<void> {
  if (!modelId) return;
  try { await qvac.unloadModel({ modelId }); } catch { /* best effort */ }
}

export { qvac };
