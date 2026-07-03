// Voice input for the Fan room: live mic → on-device Whisper (with VAD
// segmentation) → each meaningful utterance is handed to the caller, who posts
// it to the room as a normal text message. Receivers then translate/speak it
// like any other message — voice rides the exact same pipeline as text.
import { cfg } from "../config";
import { load, unload, predownload, resolveModel, qvac } from "./models";
import { micSource } from "../audio/source";

let asrId: string | null = null;

// Same meaningfulness filter the live-translation path uses: drop VAD noise
// like "[No speech detected]" and sub-3-letter fragments.
function isMeaningful(text: string): boolean {
  const t = (text || "").trim();
  if (!t || t.includes("[No speech detected]") || /^\[[^\]]+\]$/.test(t)) return false;
  return t.replace(/[^\p{L}\p{N}]/gu, "").length >= 3;
}

export type VoiceInput = { stop: () => void };

export function startVoiceInput(opts: {
  lang: string;
  onUtterance: (text: string) => void;
  onStatus?: (msg: string) => void;
}): VoiceInput {
  let stopped = false;
  let gen: AsyncGenerator<Uint8Array> | null = null;

  void (async () => {
    try {
      opts.onStatus?.("Loading speech model…");
      await predownload(cfg.stream.vad);
      const vadDesc = resolveModel(cfg.stream.vad);
      if (!asrId) {
        asrId = await load({
          constName: cfg.models.asr.const, type: cfg.models.asr.type,
          modelConfig: {
            vadModelSrc: vadDesc, audio_format: "f32le", n_threads: cfg.stream.asrThreads,
            language: opts.lang, vad_params: cfg.stream.vadParams, ...cfg.stream.asrParams,
          },
        });
      }
      if (stopped) return;

      const session = await qvac.transcribeStream({ modelId: asrId }) as {
        write: (b: Uint8Array) => void; end: () => void; [Symbol.asyncIterator]: () => AsyncIterator<string>;
      };
      opts.onStatus?.("Listening — speak and pause…");
      gen = micSource().chunks(cfg.stream.chunkMs, cfg.audio.asrSampleRate);

      // Feed mic frames concurrently; the transcript loop below consumes utterances.
      void (async () => {
        try { for await (const chunk of gen) session.write(chunk); }
        catch (e) { opts.onStatus?.(`mic error: ${(e as Error)?.message ?? e}`); }
        finally { try { session.end(); } catch { /* already closed */ } }
      })();

      for await (const raw of session) {
        if (stopped) break;
        if (isMeaningful(raw)) opts.onUtterance(raw.trim());
      }
      opts.onStatus?.("");
    } catch (e) {
      opts.onStatus?.(`voice error: ${(e as Error)?.message ?? e}`);
    }
  })();

  return {
    stop: () => {
      stopped = true;
      void gen?.return?.(undefined); // triggers micSource finally → StreamAudio.stop()
    },
  };
}

export async function unloadRoomAsr(): Promise<void> {
  if (asrId) {
    const id = asrId;
    asrId = null;
    await unload(id);
  }
}
