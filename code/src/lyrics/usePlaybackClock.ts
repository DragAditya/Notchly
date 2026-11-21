/**
 * One playback clock for the whole board.
 *
 * The island polls at 250 ms, the compact line at 80 ms and the karaoke words
 * ran their own animation frame — three clocks that drifted apart and made the
 * highlight feel late. This hook keeps a single frame loop, hands the position
 * to whoever needs it (scrubber, ring, karaoke words) without React state, and
 * only re-renders when the *line* actually changes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { musicAction, type MusicState } from "../modules/music/hooks/useMusic";
import { lineAt, type Lyrics } from "../modules/music/lyrics";

/** Words light up a touch early so the fill lands with the voice. */
export const WORD_LEAD_MS = 90;

interface PendingSeek {
  target: number;
  startedAt: number;
  until: number;
}

function positionNow(
  music: MusicState | undefined,
  pending: PendingSeek | null,
  offsetMs: number,
): number {
  const now = Date.now();
  let base: number;
  if (pending && now < pending.until) {
    // The backend has not confirmed the seek yet: keep the bar where the user
    // dropped it instead of snapping back to the previous snapshot.
    base = pending.target + (music?.playing ? now - pending.startedAt : 0);
  } else if (music) {
    base = music.positionMs + (music.playing ? Math.max(0, now - music.positionAt) : 0);
  } else {
    base = 0;
  }
  // A positive offset delays the lyrics so they line up with the voice.
  return Math.max(0, base - offsetMs);
}

export interface PlaybackClock {
  /** Index of the line being sung (-1 before the first one). */
  line: number;
  /** Current position in ms, right now. */
  time: () => number;
  /** Called every frame while playing; returns an unsubscribe function. */
  subscribe: (listener: (positionMs: number) => void) => () => void;
  /** Seeks and keeps the UI ahead of the backend until it catches up. */
  seek: (positionMs: number) => void;
}

export function usePlaybackClock(
  music: MusicState | undefined,
  lyrics: Lyrics,
  offsetMs: number,
): PlaybackClock {
  const [line, setLine] = useState(-1);
  const lineRef = useRef(-1);
  const listeners = useRef(new Set<(positionMs: number) => void>());
  const musicRef = useRef(music);
  const lyricsRef = useRef(lyrics);
  const offsetRef = useRef(offsetMs);
  const pending = useRef<PendingSeek | null>(null);
  musicRef.current = music;
  lyricsRef.current = lyrics;
  offsetRef.current = offsetMs;

  const time = useCallback(
    () => positionNow(musicRef.current, pending.current, offsetRef.current),
    [],
  );

  const emit = useCallback((position: number) => {
    listeners.current.forEach((listener) => listener(position));
  }, []);

  const subscribe = useCallback(
    (listener: (positionMs: number) => void) => {
      listeners.current.add(listener);
      listener(positionNow(musicRef.current, pending.current, offsetRef.current));
      return () => {
        listeners.current.delete(listener);
      };
    },
    [],
  );

  const seek = useCallback(
    (positionMs: number) => {
      const startedAt = Date.now();
      pending.current = { target: positionMs, startedAt, until: startedAt + 1600 };
      void musicAction("seek", Math.round(positionMs));
      emit(positionNow(musicRef.current, pending.current, offsetRef.current));
    },
    [emit],
  );

  useEffect(() => {
    const tick = () => {
      const current = musicRef.current;
      const wanted = pending.current;
      if (
        wanted &&
        current &&
        Date.now() - wanted.startedAt > 400 &&
        Math.abs(current.positionMs - wanted.target) < 1200
      ) {
        // The backend caught up with the seek; trust its clock again.
        pending.current = null;
      }

      const position = positionNow(current, pending.current, offsetRef.current);
      emit(position);

      const active = lyricsRef.current;
      if (active.synced && active.lines.length) {
        const next = lineAt(active.lines, position);
        if (next !== lineRef.current) {
          lineRef.current = next;
          setLine(next);
        }
      } else if (lineRef.current !== -1) {
        lineRef.current = -1;
        setLine(-1);
      }
    };

    tick();
    if (!music?.playing) return;
    let frame = requestAnimationFrame(function loop() {
      tick();
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [music, music?.playing, lyrics, offsetMs, emit]);

  return { line, time, subscribe, seek };
}
