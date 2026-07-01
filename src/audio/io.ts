// Platform audio I/O (Expo). The two functions here are the ONLY audio glue that
// is environment-specific; if a call needs adjusting for the installed Expo SDK,
// it's isolated here (see PORTING.md "audio glue"). Everything else is pure JS.
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { createAudioPlayer } from "expo-audio";
import { base64ToBytes, bytesToBase64 } from "./pcm";

// Read a bundled asset (require(...)) as raw bytes.
export async function readAssetBytes(moduleRef: number): Promise<Uint8Array> {
  const asset = Asset.fromModule(moduleRef);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  // readAsStringAsync(base64) is the stable, long-lived FS read. On SDK 54 it may
  // live at "expo-file-system/legacy"; swap the import if your version requires it.
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" as FileSystem.EncodingType });
  return base64ToBytes(b64);
}

// Write WAV bytes to a cache file and play them. Returns when playback starts.
export async function playWav(wavBytes: Uint8Array): Promise<void> {
  const uri = `${FileSystem.cacheDirectory}tifo-${Date.now()}.wav`;
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(wavBytes), { encoding: "base64" as FileSystem.EncodingType });
  const player = createAudioPlayer(uri);
  player.play();
}
