import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useState, type CSSProperties } from "react";
import { Glyph } from "../../../components/Glyph";
import type { Activity } from "../types";

/** Sources that always get a premium card, even if an older backend omits `tone`. */
const SOURCE_TONE: Record<string, string> = {
  volume: "wave",
  brightness: "slide",
  battery: "drop",
  bluetooth: "orbit",
};

/**
 * The premium system card: progress ring + glyph, title/subtitle and a large
 * value (or an orbit for a disconnected Bluetooth headset).
 *
 * Motion is per tone: drop, orbit, shake, zap, burst, glitch, wave and slide.
 * The card is keyed by activity tone upstream, so a new alert replays the
 * entrance while volume/brightness updates only tween the ring and number.
 */
export function SignalCard({ activity: a }: { activity: Activity }) {
  const tone = a.tone ?? SOURCE_TONE[a.source] ?? "drop";
  const accent = a.color ?? "#8e8eff";
  const progress = a.progress == null ? null : Math.min(1, Math.max(0, a.progress));
  const reduce = useReducedMotion();
  const live = useLive(900);

  const number = useSpring(0, { stiffness: 170, damping: 24, mass: 0.8 });
  useEffect(() => {
    number.set((progress ?? 0) * 100);
  }, [number, progress]);
  const display = useTransform(number, (value) => Math.round(value));

  const ringTarget = progress == null ? 0 : 100 - progress * 100;
  const isOrbit = a.source === "bluetooth" && progress == null;
  const spark = tone === "orbit" || tone === "burst" || tone === "wave" || tone === "slide";
  const entrance = entranceFor(tone, !!reduce);
  const rootStyle = { "--accent": accent } as CSSProperties;

  return (
    <div
      className={`signal-root ${live ? "is-live" : ""}`}
      style={rootStyle}
      role="status"
      aria-label={[a.title, a.subtitle].filter(Boolean).join(". ")}
    >
      <div className="signal-aura" aria-hidden />
      <motion.div
        className="signal-card fx"
        data-tone={tone}
        data-source={a.source}
        data-spark={spark ? "true" : "false"}
        initial={entrance.initial}
        animate={entrance.animate}
        transition={entrance.transition}
      >
        <span className="signal-sensor" aria-hidden />
        <span className="signal-shockwave" aria-hidden />
        <span className="signal-flash" aria-hidden />
        <span className="signal-glitch" aria-hidden />
        {spark && <Sparks />}

        <div className="signal-inner">
          <motion.div
            className="signal-icon"
            initial={reduce ? false : { opacity: 0, scale: iconFrom(tone), filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)" }}
            transition={{ duration: reduce ? 0 : 0.76, delay: reduce ? 0 : 0.12, ease: [0.22, 1.35, 0.36, 1] }}
          >
            <svg className="signal-ring" viewBox="0 0 64 64" aria-hidden>
              <circle className="signal-ring-track" cx="32" cy="32" r="26" />
              <motion.circle
                className="signal-ring-fill"
                cx="32"
                cy="32"
                r="26"
                pathLength="100"
                strokeDasharray="100"
                initial={{ strokeDashoffset: 100 }}
                animate={{ strokeDashoffset: ringTarget }}
                transition={{ duration: reduce ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
              />
            </svg>
            <span className="signal-ring-glyph">
              <Glyph name={a.icon} size={23} />
            </span>
          </motion.div>

          <div className="signal-copy">
            <motion.div
              className="signal-title"
              initial={reduce ? false : { opacity: 0, y: 9, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: reduce ? 0 : 0.52, delay: reduce ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              {a.title || " "}
            </motion.div>
            {a.subtitle && (
              <motion.div
                className="signal-sub"
                initial={reduce ? false : { opacity: 0, y: 8, filter: "blur(3px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: reduce ? 0 : 0.52, delay: reduce ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                {a.subtitle}
              </motion.div>
            )}
          </div>

          <motion.div
            className={`signal-right ${isOrbit ? "is-orbit" : ""}`}
            initial={reduce ? false : { opacity: 0, x: 10, scale: 0.94, filter: "blur(4px)" }}
            animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.26, ease: [0.22, 1.35, 0.36, 1] }}
          >
            {isOrbit ? (
              <div className={`signal-orbit ${tone === "glitch" ? "is-off" : ""}`}>
                <span className="orbit-ring" />
                <span className="orbit-ring" />
                <span className="orbit-core">
                  <Glyph name={a.icon ?? "headphones"} size={20} />
                </span>
              </div>
            ) : progress != null ? (
              <div className="signal-value" aria-label={`${Math.round(progress * 100)} percent`}>
                <motion.span className="num">{display}</motion.span>
                <span className="pct">%</span>
              </div>
            ) : (
              <div className="signal-value signal-value--text">On</div>
            )}
          </motion.div>
        </div>
        <span className="signal-shine" aria-hidden />
      </motion.div>
    </div>
  );
}

/** Sets `is-live` after the entrance, switching on the quiet idle breathing. */
function useLive(delay: number) {
  const [live, setLive] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setLive(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);
  return live;
}

function entranceFor(tone: string, reduce: boolean) {
  const normal = { opacity: 1, x: 0, y: 0, scale: 1, rotateY: 0, filter: "blur(0px) brightness(1) saturate(1)" };
  const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];
  const spring: [number, number, number, number] = [0.22, 1.35, 0.36, 1];
  const transition = {
    duration: reduce ? 0 : tone === "shake" || tone === "glitch" ? 0.76 : 0.8,
    ease: tone === "shake" || tone === "glitch" ? easeOut : spring,
  };
  if (reduce) return { initial: false as const, animate: normal, transition };

  switch (tone) {
    case "orbit":
      return {
        initial: { opacity: 0, x: 0, y: -12, scale: 0.94, rotateY: -14, transformPerspective: 900, filter: "blur(9px) brightness(1.12)" },
        animate: normal,
        transition,
      };
    case "shake":
      return {
        initial: { opacity: 0, x: 0, y: -12, scale: 0.98, filter: "blur(6px) brightness(1) saturate(1)" },
        animate: {
          ...normal,
          x: [0, -6, 5, -3, 0],
          filter: [
            "blur(0px) brightness(1.08)",
            "blur(0px) brightness(1.05)",
            "blur(0px) brightness(1.02)",
            "blur(0px) brightness(1)",
            "blur(0px) brightness(1)",
          ],
        },
        transition: { ...transition, times: [0, 0.55, 0.7, 0.84, 1] },
      };
    case "zap":
      return {
        initial: { opacity: 0, x: 0, y: 0, scale: 0.92, filter: "blur(8px) brightness(1.55) saturate(1.15)" },
        animate: normal,
        transition,
      };
    case "burst":
      return {
        initial: { opacity: 0, x: 0, y: 0, scale: 0.88, filter: "blur(10px) brightness(1.45) saturate(1.15)" },
        animate: {
          ...normal,
          scale: [1, 1.035, 1],
          filter: ["blur(0px) brightness(1.05) saturate(1.08)", "blur(0px) brightness(1.02) saturate(1.03)", "blur(0px) brightness(1) saturate(1)"],
        },
        transition: { ...transition, times: [0, 0.72, 1] },
      };
    case "glitch":
      return {
        initial: { opacity: 0, x: 20, y: 0, scale: 0.97, filter: "blur(6px) brightness(1) saturate(1.6)" },
        animate: {
          ...normal,
          x: [0, -4, 3, 0],
          filter: [
            "blur(0px) brightness(1) saturate(1.3)",
            "blur(0px) brightness(1) saturate(1.15)",
            "blur(0px) brightness(1) saturate(1.05)",
            "blur(0px) brightness(1) saturate(1)",
          ],
        },
        transition: { ...transition, times: [0, 0.55, 0.7, 1] },
      };
    case "wave":
      return {
        initial: { opacity: 0, x: 30, y: 0, scale: 0.97, filter: "blur(8px) brightness(1) saturate(1)" },
        animate: {
          ...normal,
          x: [0, -3, 2, 0],
          filter: [
            "blur(0px) brightness(1.05) saturate(1.04)",
            "blur(0px) brightness(1.03) saturate(1.03)",
            "blur(0px) brightness(1.01) saturate(1.01)",
            "blur(0px) brightness(1) saturate(1)",
          ],
        },
        transition: { ...transition, times: [0, 0.6, 0.8, 1] },
      };
    case "slide":
      return {
        initial: { opacity: 0, x: -32, y: 0, scale: 0.97, filter: "blur(8px) brightness(1) saturate(1)" },
        animate: normal,
        transition,
      };
    case "drop":
    default:
      return {
        initial: { opacity: 0, x: 0, y: -22, scale: 0.955, filter: "blur(12px) brightness(1) saturate(1)" },
        animate: normal,
        transition,
      };
  }
}

function iconFrom(tone: string) {
  switch (tone) {
    case "orbit":
      return 0.62;
    case "shake":
      return 0.78;
    case "zap":
      return 0.62;
    case "burst":
      return 0.58;
    case "glitch":
      return 0.8;
    case "wave":
      return 0.72;
    case "slide":
      return 0.72;
    default:
      return 0.7;
  }
}

/** Fourteen sparks around the ring for orbit/burst/wave/slide entrances. */
function Sparks() {
  return (
    <div className="signal-sparks" aria-hidden>
      {Array.from({ length: 14 }, (_, index) => {
        const angle = (index / 14) * Math.PI * 2 + 0.18;
        const radius = 30 + (index % 5) * 9;
        return (
          <i
            key={index}
            style={
              {
                "--tx": `${(Math.cos(angle) * radius).toFixed(1)}px`,
                "--ty": `${(Math.sin(angle) * radius).toFixed(1)}px`,
                "--d": `${index * 26}ms`,
                "--s": `${2 + (index % 3)}px`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
