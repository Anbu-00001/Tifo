// Pure-JS audio math — no platform APIs, so this is fully verifiable/testable.
// Replaces the ffmpeg step from the Node spike with in-JS WAV decode + resample.

// Minimal base64 → bytes (RN has no Buffer/atob guaranteed).
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]), b = B64.indexOf(clean[i + 1]);
    const c = B64.indexOf(clean[i + 2]), d = B64.indexOf(clean[i + 3]);
    out[p++] = (a << 2) | (b >> 4);
    if (c !== -1 && i + 2 < clean.length) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (d !== -1 && i + 3 < clean.length) out[p++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, p);
}
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | ((c ?? 0) >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[c & 63] : "=";
  }
  return out;
}

export type Wav = { pcm: Int16Array; sampleRate: number; channels: number };

// Parse a canonical PCM s16le WAV (what our TTS/commentary assets are).
export function parseWav(bytes: Uint8Array): Wav {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, false) !== 0x52494646) throw new Error("not a RIFF/WAV file");
  let channels = 1, sampleRate = 16000, dataOffset = -1, dataLen = 0;
  let off = 12;
  while (off + 8 <= bytes.length) {
    const id = dv.getUint32(off, false);
    const size = dv.getUint32(off + 4, true);
    if (id === 0x666d7420) { // "fmt "
      channels = dv.getUint16(off + 10, true);
      sampleRate = dv.getUint32(off + 12, true);
    } else if (id === 0x64617461) { // "data"
      dataOffset = off + 8; dataLen = size; break;
    }
    off += 8 + size + (size & 1);
  }
  if (dataOffset < 0) throw new Error("no data chunk");
  const n = Math.floor(dataLen / 2);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = dv.getInt16(dataOffset + i * 2, true);
  return { pcm, sampleRate, channels };
}

// Downmix to mono + linear-resample to a target rate, returning Float32 [-1,1].
export function toMonoF32(wav: Wav, targetRate: number): Float32Array {
  const { pcm, sampleRate, channels } = wav;
  const frames = Math.floor(pcm.length / channels);
  const mono = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += pcm[f * channels + c];
    mono[f] = s / channels / 32768;
  }
  if (sampleRate === targetRate) return mono;
  const ratio = targetRate / sampleRate;
  const outLen = Math.floor(mono.length * ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src), i1 = Math.min(i0 + 1, mono.length - 1);
    const t = src - i0;
    out[i] = mono[i0] * (1 - t) + mono[i1] * t;
  }
  return out;
}

// Float32 [-1,1] → little-endian f32 bytes (what transcribeStream wants: audio_format "f32le").
export function f32ToLEBytes(f32: Float32Array): Uint8Array {
  const out = new Uint8Array(f32.length * 4);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < f32.length; i++) dv.setFloat32(i * 4, f32[i], true);
  return out;
}

// Int16 PCM → canonical WAV bytes (for playing TTS output).
export function pcm16ToWavBytes(pcm: Int16Array, sampleRate: number, channels = 1): Uint8Array {
  const dataLen = pcm.length * 2;
  const buf = new Uint8Array(44 + dataLen);
  const dv = new DataView(buf.buffer);
  const w4 = (o: number, s: string) => { for (let i = 0; i < 4; i++) buf[o + i] = s.charCodeAt(i); };
  w4(0, "RIFF"); dv.setUint32(4, 36 + dataLen, true); w4(8, "WAVE");
  w4(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * channels * 2, true);
  dv.setUint16(32, channels * 2, true); dv.setUint16(34, 16, true);
  w4(36, "data"); dv.setUint32(40, dataLen, true);
  for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, pcm[i], true);
  return buf;
}

export function concatInt16(list: Int16Array[]): Int16Array {
  const total = list.reduce((n, a) => n + a.length, 0);
  const out = new Int16Array(total);
  let off = 0;
  for (const a of list) { out.set(a, off); off += a.length; }
  return out;
}
