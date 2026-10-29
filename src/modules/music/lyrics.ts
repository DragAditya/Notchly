/**
 * Lyrics: fetch + timing.
 *
 * LRCLIB is line-synced, so word timing is spread across each line by
 * character count. Both cursors run on their own clock (not the 250ms player
 * tick) so karaoke stays on the beat without re-rendering the whole island.
 */
import { useEffect, useState } from "react";
import { command, isTauri } from "../../core/bridge";
import type { LyricsMode } from "./settings";
import type { MusicState } from "./hooks/useMusic";

export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface Lyrics {
  lines: LyricLine[];
  synced: boolean;
}

export interface LyricWord {
  text: string;
  /** Absolute start/end in the song, in ms. */
  start: number;
  end: number;
}

const EMPTY: Lyrics = { lines: [], synced: false };
/** Survives remounts (settings window, island, …) and track switches. */
const cache = new Map<string, Lyrics>();

/** Width taken by everything in the compact pill except the lyric text. */
const COMPACT_CHROME = 118;
export const COMPACT_MIN = 340;
export const COMPACT_MAX = 560;

const trackKey = (music: MusicState) =>
  `${music.title}|${music.artist}|${music.album}|${Math.round(music.durationMs / 1000)}`;

/** Lyrics for the current track, from memory or LRCLIB. */
export function useLyrics(music: MusicState | undefined, enabled: boolean): Lyrics {
  const key = enabled && music?.title && music.durationMs > 0 ? trackKey(music) : "";
  const [state, setState] = useState<{ key: string; lyrics: Lyrics }>({ key: "", lyrics: EMPTY });

  useEffect(() => {
    if (!key || !music) {
      setState((s) => (s.key === "" ? s : { key: "", lyrics: EMPTY }));
      return;
    }
    const hit = cache.get(key);
    if (hit) {
      setState({ key, lyrics: hit });
      return;
    }

    let live = true;
    setState({ key: "", lyrics: EMPTY });
    (async () => {
      let lyrics = EMPTY;
      if (isTauri) {
        try {
          const res = await command<Lyrics>("get_lyrics", {
            artist: music.artist,
            title: music.title,
            album: music.album,
            durationMs: Math.round(music.durationMs),
          });
          if (res) lyrics = res;
        } catch {
          /* offline: no lyrics, the title stays */
        }
      } else {
        // Browser preview (`bun run dev`): a scripted track to design against.
        lyrics = demoLyrics();
      }
      cache.set(key, lyrics);
      if (live) setState({ key, lyrics });
    })();

    return () => {
      live = false;
    };
    // `key` already encodes artist/title/album/duration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state.key === key ? state.lyrics : EMPTY;
}

function positionAt(music: MusicState, offsetMs: number) {
  const elapsed = music.playing ? Math.max(0, Date.now() - music.positionAt) : 0;
  // A positive offset delays the lyrics so they line up with the voice.
  return Math.max(0, music.positionMs + elapsed - offsetMs);
}

/** Index of the line playing at `positionMs` (-1 before the first one). */
export function lineAt(lines: LyricLine[], positionMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= positionMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Current line, updated at 12.5 Hz for the compact width. Returns the same
 * index while the line doesn't change, so React only re-renders on a swap.
 */
export function useLyricLine(music: MusicState | undefined, lyrics: Lyrics, offsetMs: number): number {
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    if (!music || !lyrics.synced || !lyrics.lines.length) {
      setIndex(-1);
      return;
    }
    const update = () => {
      const next = lineAt(lyrics.lines, positionAt(music, offsetMs));
      setIndex((prev) => (prev === next ? prev : next));
    };
    update();
    if (!music.playing) return;
    const id = window.setInterval(update, 80);
    return () => window.clearInterval(id);
  }, [music, lyrics, offsetMs]);

  return index;
}

/** Splits a line into words and spreads the line's duration by word length. */
export function lineWords(lines: LyricLine[], index: number): LyricWord[] {
  const line = lines[index];
  if (!line) return [];
  const parts = line.text.split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const next = lines[index + 1];
  const start = line.timeMs;
  // Leave the last line some room instead of stretching it to the song's end.
  const end = next ? next.timeMs : start + Math.max(4000, parts.length * 420);
  const span = Math.max(600, end - start);
  const weights = parts.map((p) => p.length + 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;

  let cursor = start;
  return parts.map((text, i) => {
    const duration = (weights[i] / total) * span;
    const word = { text, start: cursor, end: cursor + duration };
    cursor += duration;
    return word;
  });
}

/** Index of the word being sung (-1 before the line starts). */
export function useWordIndex(
  music: MusicState | undefined,
  words: LyricWord[],
  offsetMs: number,
): number {
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    if (!music || !words.length) {
      setIndex(-1);
      return;
    }
    const update = () => {
      const pos = positionAt(music, offsetMs);
      let next = -1;
      for (let i = 0; i < words.length; i++) {
        if (pos >= words[i].start) next = i;
        else break;
      }
      setIndex((prev) => (prev === next ? prev : next));
    };
    update();
    if (!music.playing) return;
    let raf = 0;
    const loop = () => {
      update();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [music, words, offsetMs]);

  return index;
}

let canvas: CanvasRenderingContext2D | null | undefined;
const measured = new Map<string, number>();

/** Pixel width of a compact lyric at its real font. */
export function measureLyric(text: string): number {
  if (!text) return 0;
  const hit = measured.get(text);
  if (hit !== undefined) return hit;
  if (canvas === undefined) canvas = document.createElement("canvas").getContext("2d");
  if (canvas) {
    canvas.font = '600 12.5px "Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
  }
  const width = canvas ? canvas.measureText(text).width : text.length * 7.2;
  measured.set(text, width);
  return width;
}

/** Compact width that fits the line: base 340, grows to 560, then wraps. */
export function compactWidth(text: string, mode: LyricsMode): number {
  if (mode === "word" || !text) return COMPACT_MIN;
  return Math.min(COMPACT_MAX, Math.max(COMPACT_MIN, Math.ceil(measureLyric(text) + COMPACT_CHROME)));
}

const DEMO_LINES = [
  "Streetlights running through the glass",
  "Every echo pulls me back",
  "I can hear the city breathe",
  "Slow down, let it come to me",
  "Neon rivers in the rain",
  "We were never quite the same",
  "Hold the moment, let it glow",
  "Somewhere only we could go",
  "Turn the static into gold",
  "One more night before the cold",
];

function demoLyrics(): Lyrics {
  const lines: LyricLine[] = [];
  for (let cycle = 0; cycle < 5; cycle++) {
    DEMO_LINES.forEach((text, i) => {
      lines.push({ timeMs: cycle * 48_000 + i * 4_800, text });
    });
  }
  return { lines, synced: true };
}
