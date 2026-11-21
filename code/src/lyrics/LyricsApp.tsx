/**
 * The pop-out lyrics board. A frameless always-on-top window that morphs out
 * of the notch (see `src-tauri/src/lyrics_board.rs`) and sits in the corner.
 *
 * Three shapes share one playback clock:
 * - `bar`  (very short):   a wide pill — artwork with a progress ring, title,
 *                          transports and a progress line along the bottom.
 * - `mini` (short):        album art + titles, the line being sung, and the
 *                          transport + scrubber under it. Lyrics never vanish;
 *                          the type shrinks instead.
 * - `full` (tall):         the full lyric sheet with a dimmed neighbourhood,
 *                          karaoke words and a proper-looking scrubber.
 *
 * Karaoke and the scrubber are driven by `usePlaybackClock`: one frame loop,
 * direct DOM writes, and React state only when the line changes.
 */
import { AnimatePresence, motion } from "motion/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type WheelEvent } from "react";
import { CompanionEyes } from "../companion/CompanionEyes";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon, StopIcon } from "../components/icons";
import { command, isTauri, useTauriEvent } from "../core/bridge";
import { useSyncLocale, useT } from "../core/i18n";
import { useSetting } from "../core/settings";
import { Artwork } from "../modules/music/components/Artwork";
import { formatTime, musicAction, useMusic, type MusicState } from "../modules/music/hooks/useMusic";
import { lineWords, useLyrics, wordAt, type Lyrics, type LyricWord } from "../modules/music/lyrics";
import { lyricsSettings, lyricsBoardSettings } from "../modules/music/settings";
import { usePlaybackClock, WORD_LEAD_MS, type PlaybackClock } from "./usePlaybackClock";
import { useThumbnailAccent } from "./useThumbnailAccent";
import { closeLyrics, LYRICS_CHANGED, LYRICS_CLOSING } from "./useLyricsPanel";
import "./lyrics.css";

type Direction = "North" | "South" | "East" | "West" | "NorthEast" | "NorthWest" | "SouthEast" | "SouthWest";
type BoardMode = "bar" | "mini" | "full";

const HANDLES: { key: string; dir: Direction }[] = [
  { key: "n", dir: "North" },
  { key: "s", dir: "South" },
  { key: "e", dir: "East" },
  { key: "w", dir: "West" },
  { key: "ne", dir: "NorthEast" },
  { key: "nw", dir: "NorthWest" },
  { key: "se", dir: "SouthEast" },
  { key: "sw", dir: "SouthWest" },
];

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function LyricsApp() {
  const t = useT();
  useSyncLocale();
  const { music } = useMusic();
  const tint = useSetting(lyricsBoardSettings.tint);
  const bgBlur = useSetting(lyricsBoardSettings.bgBlur);
  const autoHideButtons = useSetting(lyricsBoardSettings.autoHideButtons);
  const lyricsEnabled = useSetting(lyricsSettings.enabled);
  const offsetMs = Math.round(useSetting(lyricsSettings.offset) * 1000);
  const emptyAnim = useSetting(lyricsBoardSettings.emptyAnim);
  const showEmptyText = useSetting(lyricsBoardSettings.showEmptyText);
  const nothingText = useSetting(lyricsBoardSettings.nothingText);
  const noLyricsText = useSetting(lyricsBoardSettings.noLyricsText);
  const lyrics = useLyrics(music, lyricsEnabled);
  const accent = useThumbnailAccent(music?.thumbnail);
  const clock = usePlaybackClock(music, lyrics, offsetMs);
  const [closing, setClosing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [box, setBox] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const root = useRef<HTMLDivElement>(null);

  // Three shapes. The thresholds are debounced so dragging the window edge
  // doesn't flicker between layouts at the boundary.
  const wanted: BoardMode = box.h < 112 ? "bar" : box.h < 175 ? "mini" : "full";
  const [mode, setMode] = useState<BoardMode>(wanted);
  useEffect(() => {
    if (mode === wanted) return;
    const id = window.setTimeout(() => setMode(wanted), 110);
    return () => window.clearTimeout(id);
  }, [wanted, mode]);

  const narrow = mode === "full" && box.w < 340;
  const short = mode === "full" && box.h < 240;
  const artSize =
    mode === "full"
      ? box.w < 240
        ? 32
        : box.w < 340
          ? 38
          : box.h < 240
            ? 36
            : 50
      : mode === "mini"
        ? box.w < 300
          ? 32
          : 38
        : box.w < 220
          ? 20
          : 26;
  const miniSize = Math.round(Math.max(14, Math.min(19, 13 + box.w / 90)));
  const lyricSize = Math.round(
    Math.max(
      12,
      Math.min(
        27,
        21 *
          (0.55 + 0.45 * Math.min(1, box.w / 460)) *
          (0.82 + 0.18 * Math.min(1.3, box.h / 380)),
      ),
    ),
  );

  const trackKey = `${music?.title ?? ""}|${music?.artist ?? ""}`;
  const noPlayer = !music?.available || !music.title;
  const loading = !noPlayer && lyricsEnabled && lyrics.pending === true;
  const subtitle = [music?.artist, music?.album].filter(Boolean).join(" — ") || music?.appName || t("music.board.title");
  const empty = noPlayer ? nothingText || t("music.board.nothingPlaying") : noLyricsText || t("music.board.noLyrics");

  useEffect(() => {
    const onResize = () => setBox({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The bar's artwork ring follows the same clock.
  useEffect(
    () =>
      clock.subscribe((position) => {
        const duration = music?.durationMs ?? 0;
        const ratio = duration ? Math.min(1, Math.max(0, position / duration)) : 0;
        root.current?.style.setProperty("--progress", String(ratio));
      }),
    [clock, music?.durationMs],
  );

  // The window is hidden (but stays open) while a fullscreen app is in front.
  useTauriEvent<boolean>("island://fullscreen", (v) => setFullscreen(!!v));
  useEffect(() => {
    void command<boolean>("is_fullscreen_active").then((v) => setFullscreen(!!v));
  }, []);
  useEffect(() => {
    void command("lyrics_set_visibility", { visible: !fullscreen });
  }, [fullscreen]);

  useTauriEvent<boolean>(LYRICS_CLOSING, (v) => setClosing(!!v));
  useTauriEvent<boolean>(LYRICS_CHANGED, (v) => {
    if (v) setClosing(false);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeLyrics();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Drag by the card, remember the bounds after a move or a resize.
  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void command("lyrics_snap"), 280);
    };
    let offMove: (() => void) | undefined;
    let offSize: (() => void) | undefined;
    void Promise.all([win.onMoved(schedule), win.onResized(schedule)]).then(([a, b]) => {
      offMove = a;
      offSize = b;
    });
    return () => {
      window.clearTimeout(timer);
      offMove?.();
      offSize?.();
    };
  }, []);

  const startDrag = (e: MouseEvent) => {
    if (e.button !== 0 || (e.target as Element).closest("button, .lyrics-lines, .lyrics-scrub, .lyrics-resize")) return;
    if (isTauri) void getCurrentWindow().startDragging();
  };
  const startResize = (dir: Direction) => (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isTauri) void getCurrentWindow().startResizeDragging(dir);
  };

  const palette = accent;
  const art = music?.thumbnail ? (
    <Artwork
      src={music.thumbnail}
      size={artSize}
      radius={mode === "bar" ? 999 : mode === "full" ? 13 : 10}
      trackKey={music.title}
      glow={palette.base}
    />
  ) : (
    <span
      className="lyrics-head-icon"
      style={{ width: artSize, height: artSize, borderRadius: mode === "bar" ? 999 : mode === "full" ? 13 : 10 }}
    >
      <CompanionEyes mood="calm" gaze={false} />
    </span>
  );

  return (
    <div
      ref={root}
      className={`lyrics-root is-${mode}${narrow ? " is-narrow" : ""}${short ? " is-short" : ""}${closing ? " is-closing" : ""}${autoHideButtons ? " is-autohide" : ""}${music?.playing ? " is-playing" : ""}`}
      style={
        {
          "--tint": String(tint / 100),
          "--blur": `${bgBlur}px`,
          "--lyric-size": `${lyricSize}px`,
          "--lyric-pad": `${Math.max(4, Math.round(lyricSize * 0.28))}px`,
          "--mini-size": `${miniSize}px`,
          "--accent": palette.base,
          "--accent-2": palette.light,
          "--accent-glow": palette.glow,
          "--accent-soft": palette.soft,
          "--accent-ink": palette.ink,
        } as CSSProperties
      }
      onMouseDown={startDrag}
    >
      <div className="lyrics-card">
        <AnimatePresence initial={false}>
          {music?.thumbnail && (
            <motion.div
              key={trackKey || "art"}
              className="lyrics-bg"
              aria-hidden="true"
              style={{ backgroundImage: `url("${music.thumbnail}")` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
        <div className="lyrics-glass" aria-hidden="true" />

        <div className="lyrics-content">
          <header className="lyrics-head">
            {mode === "bar" ? <div className="lyrics-ring">{art}</div> : art}
            <motion.div
              className="lyrics-titles"
              key={`titles:${trackKey}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <div className="lyrics-title">{music?.title || t("music.board.nothingPlaying")}</div>
              <div className="lyrics-artist">{subtitle}</div>
            </motion.div>
            <button type="button" className="lyrics-close" title={t("settings.close")} onClick={closeLyrics}>
              ✕
            </button>
          </header>

          <div className="lyrics-body">
            {mode === "full" ? (
              <AnimatePresence mode="wait" initial={false}>
                {noPlayer ? (
                  <motion.div key="empty" className="lyrics-body-fade" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
                    <EmptyState anim={emptyAnim} text={showEmptyText ? empty : ""} />
                  </motion.div>
                ) : loading ? (
                  <motion.div key="loading" className="lyrics-body-fade" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="lyrics-loading">
                      <div className="lyrics-eq is-small">
                        {[0, 1, 2, 3].map((i) => (
                          <span key={i} style={{ animationDelay: `${i * 0.13}s` }} />
                        ))}
                      </div>
                      <span>{t("music.board.looking")}</span>
                    </div>
                  </motion.div>
                ) : lyrics.lines.length > 0 ? (
                  <motion.div
                    key={lyrics.synced ? "synced" : "plain"}
                    className="lyrics-body-fade"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                  >
                    {lyrics.synced ? (
                      <SyncedLines lyrics={lyrics} clock={clock} resizeKey={`${box.w}x${box.h}`} />
                    ) : (
                      <PlainLines lyrics={lyrics} />
                    )}
                  </motion.div>
                ) : (
                  <motion.div key="nolyrics" className="lyrics-body-fade" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
                    <div className="lyrics-no-lyrics">{showEmptyText && <span>{empty}</span>}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                {noPlayer ? (
                  <motion.div key="mini-empty" className="lyrics-body-fade" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <MiniIdle text={showEmptyText ? empty : ""} playing={false} />
                  </motion.div>
                ) : loading ? (
                  <motion.div key="mini-loading" className="lyrics-body-fade" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <div className="lyrics-mini-skeleton" />
                  </motion.div>
                ) : lyrics.lines.length > 0 ? (
                  <motion.div key={`mini:${trackKey}`} className="lyrics-body-fade" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.24, ease: EASE }}>
                    <MiniLyric lyrics={lyrics} clock={clock} />
                  </motion.div>
                ) : (
                  <motion.div key="mini-nolyrics" className="lyrics-body-fade" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <MiniIdle text={showEmptyText ? empty : ""} playing={!!music?.playing} />
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>

          <footer className="lyrics-foot">
            <div className="lyrics-controls">
              <button type="button" className="is-skip" title={t("music.board.prev")} onClick={() => musicAction("previous")}>
                <PrevIcon size={18} />
              </button>
              <button type="button" className="is-stop" title={t("music.board.stop")} onClick={() => musicAction("stop")}>
                <StopIcon size={16} />
              </button>
              <button
                type="button"
                className="is-play"
                title={music?.playing ? t("music.board.pause") : t("music.board.play")}
                onClick={() => musicAction("toggle")}
              >
                {music?.playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
              </button>
              <button type="button" className="is-skip" title={t("music.board.next")} onClick={() => musicAction("next")}>
                <NextIcon size={18} />
              </button>
            </div>
            <Scrubber music={music} clock={clock} label={t("music.board.seek")} />
          </footer>
        </div>

        {HANDLES.map((h) => (
          <div key={h.key} className={`lyrics-resize is-${h.key}`} onMouseDown={startResize(h.dir)} />
        ))}
      </div>
    </div>
  );
}

/** Synced lines: the active one bright (word by word), neighbours dim. */
function SyncedLines({
  lyrics,
  clock,
  resizeKey,
}: {
  lyrics: Lyrics;
  clock: PlaybackClock;
  resizeKey: string;
}) {
  const active = Math.max(0, clock.line);
  const words = useMemo(() => lineWords(lyrics.lines, active), [lyrics, active]);
  const host = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const freeUntil = useRef(0);
  const [y, setY] = useState(0);

  const maxY = () => Math.max(0, (track.current?.scrollHeight ?? 0) - (host.current?.clientHeight ?? 0));
  const centre = () => {
    const el = rows.current[active];
    const box = host.current;
    if (!el || !box) return;
    const wanted = el.offsetTop - (box.clientHeight - el.offsetHeight) / 2;
    setY(Math.min(maxY(), Math.max(0, wanted)));
  };

  useLayoutEffect(centre, [active, lyrics, resizeKey]);
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (Date.now() >= freeUntil.current) centre();
    }, 220);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const onWheel = (e: WheelEvent) => {
    freeUntil.current = Date.now() + 2500;
    setY((v) => Math.min(maxY(), Math.max(0, v + e.deltaY)));
  };

  return (
    <div className="lyrics-lines" ref={host} onWheel={onWheel}>
      <motion.div
        className="lyrics-lines-track"
        ref={track}
        initial={false}
        animate={{ y: -y }}
        transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.6 }}
      >
        {lyrics.lines.map((line, i) => (
          <button
            key={`${line.timeMs}:${i}`}
            ref={(el) => {
              rows.current[i] = el;
            }}
            type="button"
            className={`lyrics-line${i === active ? " is-active" : Math.abs(i - active) <= 1 ? " is-near" : " is-far"}`}
            onClick={(e) => {
              e.stopPropagation();
              clock.seek(line.timeMs);
            }}
          >
            {i === active && words.length ? <ActiveWords words={words} clock={clock} /> : line.text}
          </button>
        ))}
      </motion.div>
    </div>
  );
}

/**
 * karaoke fill for the line being sung. Classes are toggled straight on the
 * spans from the shared clock, so a word change costs no React render.
 */
function ActiveWords({ words, clock }: { words: LyricWord[]; clock: PlaybackClock }) {
  const spans = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    let last = -2;
    const paint = (position: number) => {
      const next = wordAt(words, position + WORD_LEAD_MS);
      if (next === last) return;
      last = next;
      spans.current.forEach((span, i) => {
        if (!span) return;
        span.classList.toggle("is-sung", i <= next);
        span.classList.toggle("is-active", i === next);
      });
    };
    paint(clock.time());
    return clock.subscribe(paint);
  }, [clock, words]);

  return (
    <>
      {words.map((word, i) => (
        <span
          key={`${word.start}:${i}`}
          className="lyrics-word"
          ref={(el) => {
            spans.current[i] = el;
          }}
        >
          {word.text}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

/** One line (plus the next, dimmed) for the mini card. */
function MiniLyric({ lyrics, clock }: { lyrics: Lyrics; clock: PlaybackClock }) {
  const index = clock.line;
  const active = index >= 0 ? index : 0;
  const line = lyrics.lines[active];
  const next = lyrics.lines[active + 1];
  const words = useMemo(() => (lyrics.synced ? lineWords(lyrics.lines, active) : []), [lyrics, active]);

  return (
    <div className={`lyrics-mini${index < 0 ? " is-before" : ""}`}>
      <div className="lyrics-mini-now">
        {lyrics.synced && words.length ? <ActiveWords words={words} clock={clock} /> : (line?.text ?? "")}
      </div>
      {next?.text ? <div className="lyrics-mini-next">{next.text}</div> : null}
    </div>
  );
}

/** The mini card's resting state: a small waveform, optionally with a label. */
function MiniIdle({ text, playing }: { text: string; playing: boolean }) {
  return (
    <div className="lyrics-mini-idle">
      <div className={`lyrics-mini-wave${playing ? "" : " is-paused"}`} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ animationDelay: `${i * 0.14}s` }} />
        ))}
      </div>
      {text ? <span className="lyrics-mini-idle-text">{text}</span> : null}
    </div>
  );
}

function PlainLines({ lyrics }: { lyrics: Lyrics }) {
  return (
    <div className="lyrics-lines is-plain">
      <div className="lyrics-lines-track">
        {lyrics.lines.map((line, i) => (
          <div key={`${line.timeMs}:${i}`} className="lyrics-line is-near">
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The scrubber: elapsed / track / remaining, a gradient fill that follows the
 * accent, a hover preview and drag-to-seek. All per-frame work writes to the
 * DOM directly; only hover and drag are React state.
 */
function Scrubber({ music, clock, label }: { music: MusicState | undefined; clock: PlaybackClock; label: string }) {
  const duration = music?.durationMs ?? 0;
  const fill = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const elapsed = useRef<HTMLSpanElement>(null);
  const remaining = useRef<HTMLSpanElement>(null);
  const lastSeek = useRef(0);
  const dragging = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const preview = drag ?? hover;

  useEffect(() => {
    let second = -1;
    return clock.subscribe((position) => {
      const ratio = duration ? Math.min(1, Math.max(0, position / duration)) : 0;
      if (fill.current) fill.current.style.width = `${ratio * 100}%`;
      if (thumb.current) thumb.current.style.left = `${ratio * 100}%`;
      if (bar.current) {
        bar.current.setAttribute("aria-valuenow", String(Math.floor(position / 1000)));
        bar.current.setAttribute("aria-valuetext", formatTime(position));
      }
      const whole = Math.floor(position / 1000);
      if (whole !== second) {
        second = whole;
        if (elapsed.current) elapsed.current.textContent = formatTime(position);
        if (remaining.current) remaining.current.textContent = `-${formatTime(Math.max(0, duration - position))}`;
      }
    });
  }, [clock, duration]);

  const ratioAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return rect.width ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0;
  };
  const commit = (ratio: number, force = false) => {
    if (!duration) return;
    const now = Date.now();
    if (!force && now - lastSeek.current < 140) return;
    lastSeek.current = now;
    clock.seek(ratio * duration);
  };

  const nudge = (delta: number) => {
    if (!duration) return;
    clock.seek(Math.min(duration, Math.max(0, clock.time() + delta)));
  };

  return (
    <div className="lyrics-scrub">
      <span className="lyrics-time" ref={elapsed}>
        0:00
      </span>
      <div
        ref={bar}
        className={`lyrics-progress${drag !== null ? " is-dragging" : ""}${duration ? "" : " is-idle"}`}
        role="slider"
        tabIndex={duration ? 0 : -1}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration / 1000)}
        aria-valuenow={0}
        onPointerDown={(event) => {
          if (!duration) return;
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          const ratio = ratioAt(event);
          setDrag(ratio);
          commit(ratio, true);
        }}
        onPointerMove={(event) => {
          if (!duration) return;
          const ratio = ratioAt(event);
          if (dragging.current) {
            setDrag(ratio);
            commit(ratio);
          } else {
            setHover(ratio);
          }
        }}
        onPointerUp={(event) => {
          if (!duration) return;
          dragging.current = false;
          commit(ratioAt(event), true);
          setDrag(null);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragging.current = false;
          setDrag(null);
        }}
        onPointerLeave={() => {
          if (!dragging.current) setHover(null);
        }}
        onKeyDown={(event) => {
          if (!duration) return;
          if (event.key === "ArrowRight") {
            event.preventDefault();
            event.stopPropagation();
            nudge(event.shiftKey ? 15_000 : 5_000);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            event.stopPropagation();
            nudge(event.shiftKey ? -15_000 : -5_000);
          } else if (event.key === "Home") {
            event.preventDefault();
            clock.seek(0);
          } else if (event.key === "End") {
            event.preventDefault();
            clock.seek(duration);
          }
        }}
      >
        <div className="lyrics-progress-hover" style={{ width: `${(preview ?? 0) * 100}%` }} />
        <div className="lyrics-fill" ref={fill} />
        <div className="lyrics-thumb" ref={thumb} />
        {preview !== null && duration > 0 && (
          <span
            className="lyrics-progress-bubble"
            style={{ left: `${Math.min(94, Math.max(6, preview * 100))}%` }}
          >
            {formatTime(preview * duration)}
          </span>
        )}
      </div>
      <span className="lyrics-time is-right" ref={remaining}>
        -0:00
      </span>
    </div>
  );
}

function EmptyState({ anim, text }: { anim: string; text: string }) {
  if (anim === "none" && !text) return <div className="lyrics-empty" />;
  return (
    <div className="lyrics-empty">
      {anim !== "none" && (
        <div className={`lyrics-empty-anim is-${anim}`}>
          {anim === "face" ? (
            <CompanionEyes mood="calm" gaze={false} />
          ) : anim === "bars" ? (
            <div className="lyrics-eq">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} style={{ animationDelay: `${i * 0.13}s` }} />
              ))}
            </div>
          ) : (
            <div className="lyrics-notes">
              <span>♪</span>
              <span>♫</span>
              <span>♪</span>
            </div>
          )}
        </div>
      )}
      {text && <p>{text}</p>}
    </div>
  );
}
