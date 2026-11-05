import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useState, type CSSProperties } from "react";
import { Glyph } from "../../../components/Glyph";
import { CompanionEyes } from "../../../companion/CompanionEyes";
import type { Mood } from "../../../companion/types";
import { companionSettings, readSetting, useCompanionMode, useSettings } from "../../../core/settings";
import type { Activity } from "../types";

/** Sources that always get a premium card, even if an older backend omits `tone`. */
const SOURCE_TONE: Record<string, string> = {
  volume: "wave",
  brightness: "slide",
  battery: "drop",
  bluetooth: "orbit",
  wifi: "wifi",
};

type Performance =
  | "volume"
  | "brightness"
  | "charging"
  | "battery"
  | "low"
  | "bluetooth"
  | "bluetooth-search"
  | "bluetooth-off"
  | "wifi"
  | "wifi-search"
  | "wifi-off"
  | "notification"
  | "alert"
  | "calm";

/**
 * The premium system card, now led by the companion's eyes.
 *
 * Each signal has its own performance instead of a shared fill meter:
 * volume breathes in sound ripples, brightness blooms, charging surges,
 * Bluetooth scans or links, and a notification startles. The value stays
 * on the right; the eyes are the thing you read first.
 */
export function SignalCard({ activity: a }: { activity: Activity }) {
  const tone = a.tone ?? SOURCE_TONE[a.source] ?? "drop";
  const accent = a.color ?? "#8e8eff";
  const progress = a.progress == null ? null : Math.min(1, Math.max(0, a.progress));
  const reduce = useReducedMotion();
  const live = useLive(900);
  const companionMode = useCompanionMode();
  const settings = useSettings();
  const showEyes = companionMode === "eyes" || companionMode === "mixed";
  const showCopy = companionMode !== "eyes";
  const eyesOnly = companionMode === "eyes";
  const performance = performanceFor(a, tone);
  const mood = moodFor(performance);
  const level = progress ?? 0.5;
  const searching = performance === "bluetooth-search" || performance === "wifi-search";
  const effectOn = effectsEnabled(settings, performance);
  const isOrbit = a.source === "bluetooth" && progress == null && !showEyes;
  const entrance = entranceFor(tone, !!reduce);

  const number = useSpring(0, { stiffness: 170, damping: 24, mass: 0.8 });
  useEffect(() => {
    number.set((progress ?? 0) * 100);
  }, [number, progress]);
  const display = useTransform(number, (value) => Math.round(value));

  const ringTarget = progress == null ? 0 : 100 - progress * 100;
  const rootStyle = { "--accent": accent } as CSSProperties;
  const stageStyle = {
    "--level": level,
    "--beat": `${(1.45 - level * 0.55).toFixed(2)}s`,
    "--wave-speed": `${(1.9 - level * 0.95).toFixed(2)}s`,
    "--wave-opacity": (0.12 + level * 0.58).toFixed(2),
    "--ray-strength": (0.08 + level * 0.72).toFixed(2),
  } as CSSProperties;
  const red = performance === "notification" || performance === "low" || performance === "alert" || performance === "bluetooth-off" || performance === "wifi-off";
  const blue = performance === "bluetooth" || performance === "bluetooth-search";
  const cyan = performance === "wifi" || performance === "wifi-search";
  const eyeColor = red
    ? "#ff8a9a"
    : blue
      ? "#8fd3ff"
      : cyan
        ? "#9beeff"
        : performance === "charging"
          ? "#8dffb0"
          : `color-mix(in srgb, ${accent} 42%, #fff)`;
  const eyeGlow = red
    ? "rgba(255, 90, 110, 0.65)"
    : blue
      ? "rgba(100, 190, 255, 0.62)"
      : cyan
        ? "rgba(80, 230, 255, 0.62)"
        : performance === "charging"
          ? "rgba(80, 255, 140, 0.62)"
          : `color-mix(in srgb, ${accent} 62%, transparent)`;
  const eyeStyle = {
    "--eye-color": eyeColor,
    "--eye-glow": eyeGlow,
    ...(performance === "volume" || performance === "brightness" || performance === "battery"
      ? {
          "--eye-scale-y": String(0.58 + level * 0.42),
          "--eye-scale-x": String(0.9 + level * 0.12),
          "--pet-scale": String(0.96 + level * 0.08),
        }
      : {}),
  } as CSSProperties;

  const value =
    progress != null ? (
      <div className="signal-value" aria-label={`${Math.round(progress * 100)} percent`}>
        <motion.span className="num">{display}</motion.span>
        <span className="pct">%</span>
      </div>
    ) : (
      <div className="signal-value signal-value--text">{valueLabel(performance)}</div>
    );

  return (
    <div
      className={`signal-root ${live ? "is-live" : ""} ${eyesOnly ? "is-eyes-only" : ""}`}
      style={rootStyle}
      data-performance={showEyes ? performance : "fallback"}
      role="status"
      aria-label={[a.title, a.subtitle].filter(Boolean).join(". ")}
    >
      <div className="signal-aura" aria-hidden />
      <motion.div
        className={`signal-card fx ${eyesOnly ? "is-eyes-only" : ""}`}
        data-tone={tone}
        data-source={a.source}
        data-performance={showEyes ? performance : "fallback"}
        data-effects={effectOn ? "on" : "off"}
        initial={entrance.initial}
        animate={entrance.animate}
        transition={entrance.transition}
      >
        <span className="signal-sensor" aria-hidden />
        <span className="signal-flash" aria-hidden />
        <span className="signal-glitch" aria-hidden />

        <div className="signal-inner">
          {showEyes ? (
            <motion.div
              className="signal-eye-stage"
              data-performance={performance}
              style={stageStyle}
              initial={reduce ? false : { opacity: 0.72, scale: iconFrom(tone), filter: "blur(0px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: reduce ? 0 : 0.34, delay: 0, ease: [0.22, 1.35, 0.36, 1] }}
            >
              {effectOn && <SignalEffects performance={performance} searching={searching} />}
              <div className="signal-eye-motion">
                <CompanionEyes mood={mood} style={eyeStyle} searching={searching} gaze={false} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              className="signal-icon"
              initial={reduce ? false : { opacity: 0.72, scale: iconFrom(tone), filter: "blur(0px)" }}
              animate={{ opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)" }}
              transition={{ duration: reduce ? 0 : 0.34, delay: 0, ease: [0.22, 1.35, 0.36, 1] }}
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
          )}

          {showCopy && (
            <div className="signal-copy">
              <motion.div
                className="signal-title"
                initial={reduce ? false : { opacity: 0.72, y: 4, filter: "blur(0px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: reduce ? 0 : 0.26, delay: 0, ease: [0.16, 1, 0.3, 1] }}
              >
                {a.title || " "}
              </motion.div>
              {a.subtitle && (
                <motion.div
                  className="signal-sub"
                  initial={reduce ? false : { opacity: 0.72, y: 3, filter: "blur(0px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: reduce ? 0 : 0.26, delay: 0.02, ease: [0.16, 1, 0.3, 1] }}
                >
                  {a.subtitle}
                </motion.div>
              )}
            </div>
          )}

          <motion.div
            className={`signal-right ${isOrbit ? "is-orbit" : ""}`}
            initial={reduce ? false : { opacity: 0.72, x: 6, scale: 0.98, filter: "blur(0px)" }}
            animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: reduce ? 0 : 0.28, delay: 0.02, ease: [0.22, 1.35, 0.36, 1] }}
          >
            {isOrbit ? (
              <div className={`signal-orbit ${tone === "glitch" ? "is-off" : ""}`}>
                <span className="orbit-ring" />
                <span className="orbit-ring" />
                <span className="orbit-core">
                  <Glyph name={a.icon ?? "headphones"} size={20} />
                </span>
              </div>
            ) : (
              value
            )}
          </motion.div>
        </div>
        <span className="signal-shine" aria-hidden />
      </motion.div>
    </div>
  );
}

/** Per-signal eye effects. They sit behind the eyes, never on top of the face. */
function SignalEffects({ performance, searching }: { performance: Performance; searching: boolean }) {
  switch (performance) {
    case "volume":
      return (
        <>
          <div className="signal-fx volume-blast" aria-hidden>
            <i />
            <i />
            <i />
          </div>
          <div className="signal-fx volume-eq" aria-hidden>
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="signal-fx volume-waves" aria-hidden>
            <i />
            <i />
            <i />
          </div>
          <div className="signal-fx volume-pressure" aria-hidden>
            <i />
            <i />
          </div>
        </>
      );
    case "brightness":
      return (
        <>
          <div className="signal-fx brightness-rays" aria-hidden />
          <div className="signal-fx brightness-sun" aria-hidden>
            <i />
          </div>
          <div className="signal-fx brightness-flare" aria-hidden>
            <i />
            <i />
          </div>
        </>
      );
    case "charging":
      return (
        <>
          <div className="signal-fx charge-aura" aria-hidden>
            <i />
            <i />
            <i />
          </div>
          <div className="signal-fx charge-surge" aria-hidden>
            <i />
            <i />
          </div>
          <div className="signal-fx charge-orbit" aria-hidden>
            <i />
            <i />
            <i />
          </div>
          <div className="signal-fx charge-lightning" aria-hidden>
            <i />
            <i />
            <i />
          </div>
          <div className="signal-fx charge-motes" aria-hidden>
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <span className="charge-bolt" aria-hidden />
        </>
      );
    case "bluetooth":
      return (
        <>
          <span className="bt-aura" aria-hidden />
          <span className="bt-link-bridge" aria-hidden />
          <span className="signal-fx bt-sparks" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </>
      );
    case "bluetooth-search":
      return (
        <>
          <span className="bt-scan" aria-hidden />
          <span className="signal-fx bt-sonar" aria-hidden>
            <i />
            <i />
          </span>
          <span className="signal-fx bt-radar" aria-hidden>
            <i />
          </span>
        </>
      );
    case "bluetooth-off":
      return (
        <>
          <span className="bt-off-bridge" aria-hidden>
            <i />
            <i />
          </span>
          <span className="signal-fx bt-off-glitch" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="signal-fx bt-sonar is-off" aria-hidden>
            <i />
            <i />
          </span>
        </>
      );
    case "wifi":
      return (
        <>
          <span className="wifi-aura" aria-hidden />
          <span className="signal-fx wifi-arcs" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="signal-fx wifi-bars" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="wifi-dot" aria-hidden />
          <span className="signal-fx wifi-sparks" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </>
      );
    case "wifi-search":
      return (
        <>
          <span className="wifi-aura" aria-hidden />
          <span className="signal-fx wifi-radar" aria-hidden>
            <i />
          </span>
          <span className="signal-fx wifi-arcs is-searching" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="signal-fx wifi-bars is-searching" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="signal-fx wifi-scan" aria-hidden>
            <i />
            <i />
          </span>
        </>
      );
    case "wifi-off":
      return (
        <>
          <span className="signal-fx wifi-arcs is-off" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="signal-fx wifi-bars is-off" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="signal-fx wifi-slash" aria-hidden />
          <span className="signal-fx wifi-sparks" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </>
      );
    case "notification":
      return (
        <>
          <span className="signal-fx notification-rings" aria-hidden>
            <i />
            <i />
          </span>
          <span className="signal-fx notification-sparks" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </>
      );
    case "low":
      return (
        <>
          <span className="low-pulse" aria-hidden />
          <span className="signal-fx low-aura" aria-hidden />
          <span className="signal-fx low-cracks" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="signal-fx low-drips" aria-hidden>
            <i />
            <i />
          </span>
        </>
      );
    default:
      return searching ? <span className="bt-scan" aria-hidden /> : null;
  }
}

function performanceFor(a: Activity, tone: string): Performance {
  if (a.source === "volume") return "volume";
  if (a.source === "brightness") return "brightness";
  if (a.source === "battery") {
    if (a.icon === "charging" || tone === "zap" || tone === "burst") return "charging";
    if (a.progress != null && a.progress <= 0.2) return "low";
    return "battery";
  }
  if (a.source === "bluetooth") {
    if (tone === "scan") return "bluetooth-search";
    if (tone === "glitch") return "bluetooth-off";
    if (a.progress != null && a.progress <= 0.2) return "low";
    return "bluetooth";
  }
  if (a.source === "wifi") {
    if (tone === "scan" || tone === "wifi-search") return "wifi-search";
    if (tone === "wifi-off" || tone === "glitch") return "wifi-off";
    return "wifi";
  }
  if (a.source === "notification") return "notification";
  if (tone === "glitch" || tone === "shake") return "alert";
  return "calm";
}

function moodFor(performance: Performance): Mood {
  switch (performance) {
    case "charging":
      return "charging";
    case "low":
    case "bluetooth-off":
    case "wifi-off":
      return "low";
    case "bluetooth":
    case "wifi":
      return "happy";
    case "bluetooth-search":
    case "wifi-search":
      return "curious";
    case "notification":
      return "surprised";
    case "alert":
      return "alert";
    default:
      return "calm";
  }
}

function valueLabel(performance: Performance) {
  if (performance === "bluetooth-search" || performance === "wifi-search") return "Scan";
  if (performance === "bluetooth-off" || performance === "wifi-off") return "Lost";
  if (performance === "notification") return "New";
  return "On";
}

/** Per-signal effect switch from the Companion settings page. */
function effectsEnabled(values: Record<string, unknown>, performance: Performance): boolean {
  switch (performance) {
    case "volume":
      return readSetting(values, companionSettings.effectVolume);
    case "brightness":
      return readSetting(values, companionSettings.effectBrightness);
    case "charging":
      return readSetting(values, companionSettings.effectCharging);
    case "battery":
    case "low":
      return readSetting(values, companionSettings.effectBattery);
    case "bluetooth":
    case "bluetooth-search":
    case "bluetooth-off":
      return readSetting(values, companionSettings.effectBluetooth);
    case "wifi":
    case "wifi-search":
    case "wifi-off":
      return readSetting(values, companionSettings.effectWifi);
    case "notification":
      return readSetting(values, companionSettings.effectNotifications);
    default:
      return true;
  }
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
    duration: reduce ? 0 : 0.42,
    ease: tone === "shake" || tone === "glitch" ? easeOut : spring,
  };
  if (reduce) return { initial: false as const, animate: normal, transition };

  switch (tone) {
    case "orbit":
      return {
        initial: { opacity: 1, x: 0, y: -8, scale: 0.97, rotateY: -10, transformPerspective: 900, filter: "blur(0px) brightness(1.06)" },
        animate: normal,
        transition,
      };
    case "shake":
      return {
        initial: { opacity: 1, x: 0, y: -8, scale: 0.99, filter: "blur(0px) brightness(1) saturate(1)" },
        animate: {
          ...normal,
          x: [0, -5, 4, -2, 0],
          filter: [
            "blur(0px) brightness(1.06)",
            "blur(0px) brightness(1.04)",
            "blur(0px) brightness(1.02)",
            "blur(0px) brightness(1)",
            "blur(0px) brightness(1)",
          ],
        },
        transition: { ...transition, times: [0, 0.55, 0.7, 0.84, 1] },
      };
    case "zap":
      return {
        initial: { opacity: 1, x: 0, y: 0, scale: 0.96, filter: "blur(0px) brightness(1.25) saturate(1.1)" },
        animate: normal,
        transition,
      };
    case "burst":
      return {
        initial: { opacity: 1, x: 0, y: 0, scale: 0.94, filter: "blur(0px) brightness(1.2) saturate(1.1)" },
        animate: {
          ...normal,
          scale: [1, 1.025, 1],
          filter: ["blur(0px) brightness(1.04) saturate(1.06)", "blur(0px) brightness(1.02) saturate(1.03)", "blur(0px) brightness(1) saturate(1)"],
        },
        transition: { ...transition, times: [0, 0.72, 1] },
      };
    case "glitch":
      return {
        initial: { opacity: 1, x: 12, y: 0, scale: 0.99, filter: "blur(0px) brightness(1) saturate(1.35)" },
        animate: {
          ...normal,
          x: [0, -3, 2, 0],
          filter: [
            "blur(0px) brightness(1) saturate(1.22)",
            "blur(0px) brightness(1) saturate(1.12)",
            "blur(0px) brightness(1) saturate(1.04)",
            "blur(0px) brightness(1) saturate(1)",
          ],
        },
        transition: { ...transition, times: [0, 0.55, 0.7, 1] },
      };
    case "wave":
      return {
        initial: { opacity: 1, x: 16, y: 0, scale: 0.99, filter: "blur(0px) brightness(1) saturate(1)" },
        animate: {
          ...normal,
          x: [0, -3, 2, 0],
          filter: [
            "blur(0px) brightness(1.04) saturate(1.03)",
            "blur(0px) brightness(1.02) saturate(1.02)",
            "blur(0px) brightness(1.01) saturate(1.01)",
            "blur(0px) brightness(1) saturate(1)",
          ],
        },
        transition: { ...transition, times: [0, 0.6, 0.8, 1] },
      };
    case "slide":
      return {
        initial: { opacity: 1, x: -18, y: 0, scale: 0.99, filter: "blur(0px) brightness(1) saturate(1)" },
        animate: normal,
        transition,
      };
    case "drop":
    default:
      return {
        initial: { opacity: 1, x: 0, y: -12, scale: 0.98, filter: "blur(0px) brightness(1) saturate(1)" },
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
