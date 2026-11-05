/**
 * The three lyric surfaces:
 * - compact line: current line, words lighting up as they're sung;
 * - compact word: one word at a time, centred between the artwork and the time;
 * - expanded column: the surrounding lines, spring-centred on the current one.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { musicAction, type MusicState } from "../hooks/useMusic";
import { lineWords, useWordIndex, type Lyrics, type LyricWord } from "../lyrics";
import type { LyricsMode } from "../settings";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function CompactLyrics({
  mode,
  ...props
}: {
  mode: LyricsMode;
  music: MusicState;
  lyrics: Lyrics;
  index: number;
  offsetMs: number;
}) {
  return mode === "word" ? <CompactWord {...props} /> : <CompactLine {...props} />;
}

function CompactLine({
  music,
  lyrics,
  index,
  offsetMs,
}: {
  music: MusicState;
  lyrics: Lyrics;
  index: number;
  offsetMs: number;
}) {
  const line = Math.max(0, index);
  const words = useMemo(() => lineWords(lyrics.lines, line), [lyrics, line]);
  const word = useWordIndex(music, words, offsetMs);

  return (
    <div className="music-compact-line">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={line}
          className="music-lyric-text"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.28, ease: EASE }}
        >
          {words.map((w, i) => (
            <span
              key={`${w.start}:${i}`}
              className={`music-lyric-word${i <= word ? " is-sung" : ""}${i === word ? " is-active" : ""}`}
            >
              {w.text}
              {i < words.length - 1 ? " " : ""}
            </span>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function CompactWord({
  music,
  lyrics,
  index,
  offsetMs,
}: {
  music: MusicState;
  lyrics: Lyrics;
  index: number;
  offsetMs: number;
}) {
  const line = Math.max(0, index);
  const words = useMemo(() => lineWords(lyrics.lines, line), [lyrics, line]);
  const word = Math.max(0, useWordIndex(music, words, offsetMs));
  const current = words[word];
  if (!current) return null;

  return (
    <div className="music-compact-word">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={`${line}:${word}`}
          className="music-word"
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -7, scale: 0.98 }}
          transition={{ duration: 0.22, ease: EASE }}
        >
          {current.text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

export function MusicLyricsColumn({
  music,
  lyrics,
  index,
  offsetMs,
}: {
  music: MusicState;
  lyrics: Lyrics;
  index: number;
  offsetMs: number;
}) {
  const active = Math.max(0, index);
  const host = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const [y, setY] = useState(0);
  const words = useMemo(() => lineWords(lyrics.lines, active), [lyrics, active]);

  const centre = () => {
    const el = rows.current[active];
    const box = host.current;
    if (!el || !box) return;
    const wanted = el.offsetTop - (box.clientHeight - el.offsetHeight) / 2;
    const max = Math.max(0, (track.current?.scrollHeight ?? 0) - box.clientHeight);
    setY(Math.min(max, Math.max(0, wanted)));
  };

  useLayoutEffect(centre, [active, lyrics]);
  // Fonts can settle a frame later; re-centre once.
  useEffect(() => {
    const id = requestAnimationFrame(centre);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="music-lyrics" ref={host} data-no-drag>
      <motion.div
        className="music-lyrics-track"
        ref={track}
        initial={false}
        animate={{ y: -y }}
        transition={{ type: "spring", stiffness: 190, damping: 30, mass: 0.7 }}
      >
        {lyrics.lines.map((line, i) => (
          <button
            key={`${line.timeMs}:${i}`}
            ref={(el) => {
              rows.current[i] = el;
            }}
            type="button"
            className={`music-lyric-row${i === active ? " is-active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              musicAction("seek", line.timeMs);
            }}
          >
            {i === active ? (
              <ActiveLine music={music} words={words} offsetMs={offsetMs} />
            ) : (
              line.text
            )}
          </button>
        ))}
      </motion.div>
    </div>
  );
}

function ActiveLine({
  music,
  words,
  offsetMs,
}: {
  music: MusicState;
  words: LyricWord[];
  offsetMs: number;
}) {
  const word = useWordIndex(music, words, offsetMs);
  return <ActiveWords words={words} word={word} />;
}

function ActiveWords({ words, word }: { words: LyricWord[]; word: number }) {
  return (
    <>
      {words.map((w, i) => (
        <span
          key={`${w.start}:${i}`}
          className={`music-lyric-word${i <= word ? " is-sung" : ""}${i === word ? " is-active" : ""}`}
        >
          {w.text}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}
