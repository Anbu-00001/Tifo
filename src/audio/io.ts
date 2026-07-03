// Platform audio I/O (Expo). The two functions here are the ONLY audio glue that
// is environment-specific; if a call needs adjusting for the installed Expo SDK,
// it's isolated here (see PORTING.md "audio glue"). Everything else is pure JS.
//
// expo-file-system 19 (SDK 54) moved the classic readAsStringAsync/cacheDirectory
// out of the default export (the legacy re-exports now THROW at runtime). We use
// the new object API: File.bytes() gives a Uint8Array directly and File.write()
// accepts a Uint8Array directly — so no base64 round-trip either way.
import { Asset } from "expo-asset";
import { File, Paths } from "expo-file-system";
import { createAudioPlayer } from "expo-audio";

// Read a bundled asset (require(...)) as raw bytes.
export async function readAssetBytes(moduleRef: number): Promise<Uint8Array> {
  const asset = Asset.fromModule(moduleRef);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  return new File(uri).bytes();
}

// Write WAV bytes to a unique cache file and play them. Returns when playback starts.
export async function playWav(wavBytes: Uint8Array): Promise<void> {
  const name = `tifo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
  const file = new File(Paths.cache, name);
  try { file.create(); } catch { /* already exists */ }
  file.write(wavBytes);
  const player = createAudioPlayer(file.uri);
  player.play();
}

// Like playWav, but resolves when playback FINISHES (didJustFinish event), so
// callers can serialize utterances. A duration-derived timeout guards against
// the event never firing (player torn down, audio focus lost, …).
export async function playWavAndWait(wavBytes: Uint8Array, sampleRate: number): Promise<void> {
  const name = `tifo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
  const file = new File(Paths.cache, name);
  try { file.create(); } catch { /* already exists */ }
  file.write(wavBytes);
  const durationMs = ((wavBytes.byteLength - 44) / 2 / sampleRate) * 1000; // PCM16 mono
  const player = createAudioPlayer(file.uri);
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sub.remove(); } catch { /* already removed */ }
      try { player.remove(); } catch { /* already released */ }
      resolve();
    };
    const timer = setTimeout(finish, durationMs + 3000);
    const sub = player.addListener("playbackStatusUpdate", (st) => {
      if (st.didJustFinish) finish();
    });
    player.play();
  });
}
