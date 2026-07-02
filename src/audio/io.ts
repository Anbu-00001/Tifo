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
