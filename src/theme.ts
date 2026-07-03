// Design tokens — ported 1:1 from the TIFO Claude-design spec (TIFO.dc.html).
export const C = {
  bg: "#070908",
  device: "#070b09",
  panel1: "#0d1714",
  panel2: "#0a100e",
  line: "#233029",
  line2: "#1d2623",
  fg: "#e8efec",
  mut: "#9fb0aa",
  mut2: "#7e8e88",
  accent: "#23d18b",
  accentDark: "#16a06a",
  amber: "#e7b24c",
  red: "#ef6a52",
  blue: "#5b6eff",
} as const;

// Archivo (display/body) + JetBrains Mono (labels/badges). Loaded via expo-font
// in App.tsx; these names must match the loaded family keys.
export const F = {
  sans: "Archivo",
  sansBold: "Archivo-Bold",
  mono: "JetBrainsMono",
} as const;

export const R = { device: 40, card: 16, pill: 999, chip: 14 } as const;

// Archivo only ships Latin glyphs. For text that may carry other scripts
// (Devanagari, Arabic, Cyrillic, …) fall back to the system font, which
// Android/iOS guarantee covers everything. Emoji (surrogate pairs) are fine
// in any font, so they don't trigger the fallback.
const NON_LATIN = new RegExp("[\\u0370-\\u1DFF\\u2C00-\\uD7FF\\uFB00-\\uFDFF\\uFE70-\\uFEFF]");
export function fontFor(text: string): string | undefined {
  return NON_LATIN.test(text) ? undefined : F.sans;
}
