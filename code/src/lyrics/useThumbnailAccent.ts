/**
 * A palette taken from the album art.
 *
 * The board's accent (scrubber, play button, karaoke glow, seek thumb) changes
 * with the cover. The artwork arrives as a data URL, so a tiny canvas can read
 * it without tainting. Near-black, near-white and grey pixels are ignored;
 * the most vivid cluster wins. Everything falls back to the coral accent.
 */
import { useEffect, useState } from "react";

export interface ThumbnailAccent {
  /** Solid accent, safe on the dark glass. */
  base: string;
  /** Lighter neighbour for gradients. */
  light: string;
  /** Translucent glow for shadows and the active word. */
  glow: string;
  /** Very light wash for the glass. */
  soft: string;
  /** Readable ink when the accent is used as a button background. */
  ink: string;
}

export const FALLBACK_ACCENT: ThumbnailAccent = {
  base: "#e5836f",
  light: "#f2a795",
  glow: "rgba(240, 160, 140, 0.45)",
  soft: "rgba(229, 131, 111, 0.16)",
  ink: "#1b100e",
};

const MAX_CACHE = 8;
const cache = new Map<string, ThumbnailAccent>();

/** Palette for `src`, computed once per cover and reused across remounts. */
export function useThumbnailAccent(src: string | null | undefined): ThumbnailAccent {
  const [accent, setAccent] = useState<ThumbnailAccent>(
    () => (src && cache.get(src)) || FALLBACK_ACCENT,
  );

  useEffect(() => {
    if (!src) {
      setAccent(FALLBACK_ACCENT);
      return;
    }
    const hit = cache.get(src);
    if (hit) {
      setAccent(hit);
      return;
    }

    let live = true;
    void extract(src).then((result) => {
      if (cache.size >= MAX_CACHE) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      cache.set(src, result);
      if (live) setAccent(result);
    });
    return () => {
      live = false;
    };
  }, [src]);

  return accent;
}

function extract(src: string): Promise<ThumbnailAccent> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(analyse(image));
    image.onerror = () => resolve(FALLBACK_ACCENT);
    image.src = src;
  });
}

function analyse(image: HTMLImageElement): ThumbnailAccent {
  const size = 24;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return FALLBACK_ACCENT;

  try {
    context.drawImage(image, 0, 0, size, size);
  } catch {
    return FALLBACK_ACCENT;
  }

  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, size, size).data;
  } catch {
    return FALLBACK_ACCENT;
  }

  // Coarse hue buckets; each one averages its own saturation and lightness.
  const buckets = new Map<number, { count: number; h: number; s: number; l: number; score: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 180) continue;
    const [h, s, l] = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (s < 0.2 || l < 0.14 || l > 0.88) continue;
    const key = Math.round(h / 12) % 30;
    const bucket = buckets.get(key) ?? { count: 0, h: 0, s: 0, l: 0, score: 0 };
    bucket.count += 1;
    bucket.h += h;
    bucket.s += s;
    bucket.l += l;
    // Vivid mid-tones make the best accent.
    bucket.score += s * (1 - Math.abs(l - 0.52)) * 2;
    buckets.set(key, bucket);
  }

  let best: { count: number; h: number; s: number; l: number; score: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.score > best.score) best = bucket;
  }
  if (!best || best.count === 0) return FALLBACK_ACCENT;

  const hue = Math.round(best.h / best.count);
  const saturation = clamp((best.s / best.count) * 100, 56, 88);
  const lightness = clamp((best.l / best.count) * 100, 50, 66);
  const base = hslToHex(hue, saturation, lightness);
  const light = hslToHex((hue + 16) % 360, clamp(saturation + 4, 0, 92), clamp(lightness + 9, 0, 82));
  const [r, g, b] = hexToRgb(base);

  return {
    base,
    light,
    glow: `rgba(${r}, ${g}, ${b}, 0.45)`,
    soft: `rgba(${r}, ${g}, ${b}, 0.16)`,
    ink: lightness > 62 ? "#1b100e" : "#ffffff",
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) return [0, 0, lightness];

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === rn) hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;

  return [(hue * 60 + 360) % 360, Math.min(1, saturation), lightness];
}

function hslToHex(h: number, s: number, l: number): string {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [chroma, x, 0];
  else if (h < 120) [r, g, b] = [x, chroma, 0];
  else if (h < 180) [r, g, b] = [0, chroma, x];
  else if (h < 240) [r, g, b] = [0, x, chroma];
  else if (h < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  return `#${toHex(r + m)}${toHex(g + m)}${toHex(b + m)}`;
}

function toHex(channel: number) {
  return Math.round(Math.min(1, Math.max(0, channel)) * 255)
    .toString(16)
    .padStart(2, "0");
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}
