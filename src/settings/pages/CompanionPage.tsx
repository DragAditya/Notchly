import { useEffect, useRef, useState } from "react";
import { CompanionEyes } from "../../companion/CompanionEyes";
import { PALETTE } from "../../core/appearance";
import { command, isTauri } from "../../core/bridge";
import { useT, type MessageKey } from "../../core/i18n";
import {
  companionModeOf,
  companionSettings,
  readSetting,
  setSetting,
  type CompanionDance,
  type CompanionIntensity,
  type CompanionMode,
  type SettingDef,
} from "../../core/settings";
import { Toggle, ToggleRow } from "../components/Toggle";

const MODES: {
  id: CompanionMode;
  label: "companion.mode.off" | "companion.mode.eyes" | "companion.mode.activities" | "companion.mode.mixed";
  desc:
    | "companion.mode.offDesc"
    | "companion.mode.eyesDesc"
    | "companion.mode.activitiesDesc"
    | "companion.mode.mixedDesc";
}[] = [
  { id: "off", label: "companion.mode.off", desc: "companion.mode.offDesc" },
  { id: "eyes", label: "companion.mode.eyes", desc: "companion.mode.eyesDesc" },
  { id: "activities", label: "companion.mode.activities", desc: "companion.mode.activitiesDesc" },
  { id: "mixed", label: "companion.mode.mixed", desc: "companion.mode.mixedDesc" },
];

const INTENSITIES: { id: CompanionIntensity; label: "companion.intensity.calm" | "companion.intensity.balanced" | "companion.intensity.energetic" }[] = [
  { id: "calm", label: "companion.intensity.calm" },
  { id: "balanced", label: "companion.intensity.balanced" },
  { id: "energetic", label: "companion.intensity.energetic" },
];

const SPEEDS: { value: number; label: "companion.speed.075" | "companion.speed.1" | "companion.speed.125" | "companion.speed.15" }[] = [
  { value: 0.75, label: "companion.speed.075" },
  { value: 1, label: "companion.speed.1" },
  { value: 1.25, label: "companion.speed.125" },
  { value: 1.5, label: "companion.speed.15" },
];

const BLINK_RATES: { value: number; label: MessageKey }[] = [
  { value: 10, label: "companion.blinkRate.slow" },
  { value: 7.2, label: "companion.blinkRate.normal" },
  { value: 4, label: "companion.blinkRate.fast" },
];

const DANCES: { id: CompanionDance; label: MessageKey }[] = [
  { id: "auto", label: "companion.music.dance.auto" },
  { id: "groove", label: "companion.music.dance.groove" },
  { id: "bounce", label: "companion.music.dance.bounce" },
  { id: "shimmy", label: "companion.music.dance.shimmy" },
  { id: "wave", label: "companion.music.dance.wave" },
  { id: "spin", label: "companion.music.dance.spin" },
  { id: "hop", label: "companion.music.dance.hop" },
];

const EFFECTS: SettingDef[] = [
  companionSettings.effectVolume,
  companionSettings.effectBrightness,
  companionSettings.effectCharging,
  companionSettings.effectBattery,
  companionSettings.effectBluetooth,
  companionSettings.effectWifi,
  companionSettings.effectNotifications,
];

const TESTS: { id: string; label: MessageKey; tone: "blue" | "yellow" | "green" | "orange" | "red" | "cyan" | "pink" }[] = [
  { id: "volume", label: "companion.test.volume", tone: "blue" },
  { id: "brightness", label: "companion.test.brightness", tone: "yellow" },
  { id: "charging", label: "companion.test.charging", tone: "green" },
  { id: "full", label: "companion.test.full", tone: "green" },
  { id: "low", label: "companion.test.low", tone: "orange" },
  { id: "battery", label: "companion.test.battery", tone: "green" },
  { id: "bluetooth", label: "companion.test.bluetooth", tone: "blue" },
  { id: "bluetooth-search", label: "companion.test.bluetoothSearch", tone: "blue" },
  { id: "bluetooth-off", label: "companion.test.bluetoothLost", tone: "red" },
  { id: "wifi", label: "companion.test.wifi", tone: "cyan" },
  { id: "wifi-search", label: "companion.test.wifiSearch", tone: "cyan" },
  { id: "wifi-off", label: "companion.test.wifiLost", tone: "red" },
  { id: "notification", label: "companion.test.notification", tone: "pink" },
];

/** The companion's own page: presentation, motion, per-signal effects and music. */
export function CompanionPage({ values }: { values: Record<string, unknown> }) {
  const t = useT();
  const mode = companionModeOf(readSetting(values, companionSettings.mode));
  const intensity = readSetting(values, companionSettings.intensity);
  const speed = readSetting(values, companionSettings.speed);
  const dance = readSetting(values, companionSettings.dance);
  const eyeColor = readSetting(values, companionSettings.eyeColor);
  const blinkRate = readSetting(values, companionSettings.blinkRate);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  const runTest = (kind: string) => {
    if (!isTauri) return;
    void command("test_activity", { kind });
  };

  const stopAll = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setPlaying(false);
  };

  const playAll = () => {
    if (!isTauri) return;
    stopAll();
    let index = 0;
    setPlaying(true);
    const next = () => {
      if (index >= TESTS.length) {
        timer.current = null;
        setPlaying(false);
        return;
      }
      runTest(TESTS[index++].id);
      timer.current = window.setTimeout(next, 2_800);
    };
    next();
  };

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const reset = () => {
    setSetting(companionSettings.mode, "mixed");
    setSetting(companionSettings.resting, true);
    setSetting(companionSettings.intensity, "balanced");
    setSetting(companionSettings.speed, 1);
    setSetting(companionSettings.glow, true);
    setSetting(companionSettings.reduceMotion, false);
    for (const def of EFFECTS) setSetting(def, true);
    setSetting(companionSettings.musicEyes, true);
    setSetting(companionSettings.dance, "auto");
    setSetting(companionSettings.eyeColor, "");
    setSetting(companionSettings.blinkRate, 7.2);
    setSetting(companionSettings.gazeFollow, true);
  };

  return (
    <>
      <h1 className="settings-title">{t("companion.title")}</h1>

      <section className="settings-card">
        <div className="settings-block">
          <div className="settings-row is-static">
            <div className="settings-text">
              <span className="settings-label">{t(companionSettings.mode.label)}</span>
              <span className="settings-desc">{t(companionSettings.mode.description!)}</span>
            </div>
          </div>
          <div className="companion-modes">
            {MODES.map((option) => (
              <button
                key={option.id}
                className={`companion-mode ${mode === option.id ? "is-active" : ""}`}
                onClick={() => setSetting(companionSettings.mode, option.id)}
              >
                <ModePreview mode={option.id} />
                <span className="style-name">{t(option.label)}</span>
                <span className="settings-desc">{t(option.desc)}</span>
              </button>
            ))}
          </div>
        </div>
        <ToggleRow def={companionSettings.resting} value={readSetting(values, companionSettings.resting)} />
      </section>

      <section className="settings-card">
        <div className="settings-block">
          <div className="settings-row is-static">
            <div className="settings-text">
              <span className="settings-label">{t(companionSettings.eyeColor.label)}</span>
              <span className="settings-desc">{t(companionSettings.eyeColor.description!)}</span>
            </div>
            <div className="eye-colors">
              <button
                className={`eye-color is-auto ${eyeColor ? "" : "is-active"}`}
                onClick={() => setSetting(companionSettings.eyeColor, "")}
              >
                {t("companion.eyeColor.auto")}
              </button>
              {PALETTE.map((color) => (
                <button
                  key={color}
                  className={`eye-color ${eyeColor.toLowerCase() === color.toLowerCase() ? "is-active" : ""}`}
                  style={{ background: color }}
                  title={color}
                  aria-label={color}
                  onClick={() => setSetting(companionSettings.eyeColor, color)}
                />
              ))}
            </div>
          </div>
          <div className="settings-row is-static">
            <div className="settings-text">
              <span className="settings-label">{t(companionSettings.blinkRate.label)}</span>
              <span className="settings-desc">{t(companionSettings.blinkRate.description!)}</span>
            </div>
            <div className="segmented">
              {BLINK_RATES.map((option) => (
                <button
                  key={option.value}
                  className={blinkRate === option.value ? "is-active" : ""}
                  onClick={() => setSetting(companionSettings.blinkRate, option.value)}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ToggleRow def={companionSettings.gazeFollow} value={readSetting(values, companionSettings.gazeFollow)} />
      </section>

      <section className="settings-card">
        <div className="settings-block">
          <div className="settings-row is-static">
            <div className="settings-text">
              <span className="settings-label">{t("companion.test.label")}</span>
              <span className="settings-desc">{t("companion.test.desc")}</span>
            </div>
            <button
              className="settings-btn"
              onClick={playing ? stopAll : playAll}
              disabled={!isTauri}
            >
              {playing ? t("companion.test.stop") : t("companion.test.all")}
            </button>
          </div>
          <div className="companion-tests">
            {TESTS.map((test) => (
              <button
                key={test.id}
                className="companion-test"
                onClick={() => runTest(test.id)}
                disabled={!isTauri}
              >
                <span className={`companion-test-dot is-${test.tone}`} />
                {t(test.label)}
              </button>
            ))}
          </div>
          {!isTauri && <span className="settings-desc">{t("companion.test.browser")}</span>}
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-block">
          <div className="settings-row is-static">
            <div className="settings-text">
              <span className="settings-label">{t(companionSettings.intensity.label)}</span>
              <span className="settings-desc">{t(companionSettings.intensity.description!)}</span>
            </div>
            <div className="segmented">
              {INTENSITIES.map((option) => (
                <button
                  key={option.id}
                  className={intensity === option.id ? "is-active" : ""}
                  onClick={() => setSetting(companionSettings.intensity, option.id)}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row is-static">
            <div className="settings-text">
              <span className="settings-label">{t(companionSettings.speed.label)}</span>
              <span className="settings-desc">{t(companionSettings.speed.description!)}</span>
            </div>
            <div className="segmented">
              {SPEEDS.map((option) => (
                <button
                  key={option.value}
                  className={speed === option.value ? "is-active" : ""}
                  onClick={() => setSetting(companionSettings.speed, option.value)}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ToggleRow def={companionSettings.glow} value={readSetting(values, companionSettings.glow)} />
        <ToggleRow def={companionSettings.reduceMotion} value={readSetting(values, companionSettings.reduceMotion)} />
      </section>

      <section className="settings-card">
        <div className="settings-block">
          <div className="settings-row is-static">
            <div className="settings-text">
              <span className="settings-label">{t("companion.effect.label")}</span>
              <span className="settings-desc">{t("companion.effect.desc")}</span>
            </div>
          </div>
          <div className="companion-effects">
            {EFFECTS.map((def) => (
              <label key={def.key} className="companion-effect">
                <span>{t(def.label)}</span>
                <Toggle checked={readSetting(values, def)} onChange={(value) => setSetting(def, value)} />
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-card">
        <ToggleRow def={companionSettings.musicEyes} value={readSetting(values, companionSettings.musicEyes)} />
        <label className="settings-row">
          <div className="settings-text">
            <span className="settings-label">{t(companionSettings.dance.label)}</span>
            <span className="settings-desc">{t(companionSettings.dance.description!)}</span>
          </div>
          <select
            className="settings-select"
            value={dance}
            onChange={(event) => setSetting(companionSettings.dance, event.target.value as CompanionDance)}
          >
            {DANCES.map((option) => (
              <option key={option.id} value={option.id}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="settings-card">
        <div className="settings-row is-static">
          <div className="settings-text">
            <span className="settings-label">{t("companion.shortcuts.label")}</span>
            <span className="settings-desc">{t("companion.shortcuts.desc")}</span>
          </div>
        </div>
        <div className="settings-row is-static">
          <div className="settings-text">
            <span className="settings-desc">{t("companion.privacy")}</span>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-row is-static">
          <div className="settings-text">
            <span className="settings-label">{t("companion.reset.label")}</span>
            <span className="settings-desc">{t("companion.reset.desc")}</span>
          </div>
          <button className="settings-btn danger" onClick={reset}>
            {t("companion.reset.button")}
          </button>
        </div>
      </section>
    </>
  );
}

/** A tiny island mock: eyes, card bars, or both, depending on the mode. */
function ModePreview({ mode }: { mode: CompanionMode }) {
  const eyes = mode === "eyes" || mode === "mixed";
  const detail = mode === "mixed" || mode === "activities" || mode === "off";
  return (
    <div className={`companion-mode-preview is-${mode}`}>
      <div className="companion-mode-island">
        {eyes && (
          <span className="companion-mode-eyes">
            <CompanionEyes mood="calm" gaze={false} />
          </span>
        )}
        {detail && (
          <span className="companion-mode-detail">
            {mode !== "mixed" && <i className="companion-mode-badge" />}
            <i />
            <i />
          </span>
        )}
      </div>
    </div>
  );
}
