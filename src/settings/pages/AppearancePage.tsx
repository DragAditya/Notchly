import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { BORDER_PRESETS, borderColors, PALETTE, rimBackground, swatchBackground, THICKNESSES } from "../../core/appearance";
import { useT, type MessageKey } from "../../core/i18n";
import {
  appearanceSettings,
  ISLAND_HIDDEN_KEY,
  readSetting,
  resetSettings,
  setSetting,
  type CompactDensity,
  type IdleClockFormat,
  type IslandStyle,
} from "../../core/settings";
import { Toggle, ToggleRow } from "../components/Toggle";

const STYLES: { id: IslandStyle; name: "appearance.style.dynamic" | "appearance.style.windows"; desc: "appearance.style.dynamicDesc" | "appearance.style.windowsDesc" }[] = [
  { id: "dynamic", name: "appearance.style.dynamic", desc: "appearance.style.dynamicDesc" },
  { id: "windows", name: "appearance.style.windows", desc: "appearance.style.windowsDesc" },
];

const DENSITIES: { id: CompactDensity; label: MessageKey }[] = [
  { id: "compact", label: "appearance.density.compact" },
  { id: "cozy", label: "appearance.density.cozy" },
  { id: "roomy", label: "appearance.density.roomy" },
];

const SPEEDS: { value: number; label: MessageKey }[] = [
  { value: 0.75, label: "appearance.animationSpeed.slow" },
  { value: 1, label: "appearance.animationSpeed.normal" },
  { value: 1.25, label: "appearance.animationSpeed.fast" },
  { value: 1.5, label: "appearance.animationSpeed.faster" },
];

const BORDER_SPEEDS: { value: number; label: MessageKey }[] = [
  { value: 12, label: "appearance.borderSpeed.slow" },
  { value: 7, label: "appearance.borderSpeed.normal" },
  { value: 3.5, label: "appearance.borderSpeed.fast" },
];

const CLOCK_FORMATS: { id: IdleClockFormat; label: MessageKey }[] = [
  { id: "time", label: "appearance.clockFormat.time" },
  { id: "date", label: "appearance.clockFormat.date" },
  { id: "both", label: "appearance.clockFormat.both" },
];

/** Look of the island: the visual style and, for Windows Island, its rim. */
export function AppearancePage({ values }: { values: Record<string, unknown> }) {
  const t = useT();
  const style = readSetting(values, appearanceSettings.style);
  const border = readSetting(values, appearanceSettings.border);
  const custom = readSetting(values, appearanceSettings.customColors);
  const thickness = readSetting(values, appearanceSettings.thickness);
  const rim = borderColors(border, custom);
  const windows = style === "windows";
  const hidden = values[ISLAND_HIDDEN_KEY] === true;

  return (
    <>
      <h1 className="settings-title">{t("appearance.title")}</h1>

      <section className="settings-card">
        <div className="settings-block">
          <div className="settings-row">
            <div className="settings-text">
              <span className="settings-label">{t("appearance.style.label")}</span>
              <span className="settings-desc">{t("appearance.style.desc")}</span>
            </div>
          </div>
          <div className="style-picker">
            {STYLES.map((s) => (
              <button
                key={s.id}
                className={`style-option ${style === s.id ? "is-active" : ""}`}
                onClick={() => setSetting(appearanceSettings.style, s.id)}
              >
                <StylePreview style={s.id} rim={s.id === "windows" ? rim : []} />
                <span className="style-name">{t(s.name)}</span>
                <span className="settings-desc">{t(s.desc)}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-card">
        <RangeRow
          label="appearance.blur.label"
          description="appearance.blur.desc"
          value={readSetting(values, appearanceSettings.backgroundBlur)}
          min={0}
          max={32}
          step={4}
          format={(v) => (v ? `${v}px` : t("appearance.blur.off"))}
          onChange={(v) => setSetting(appearanceSettings.backgroundBlur, v)}
        />
        <RangeRow
          label="appearance.radius.label"
          description="appearance.radius.desc"
          value={readSetting(values, appearanceSettings.cornerRadius)}
          min={0}
          max={40}
          step={4}
          format={(v) => (v ? `${v}px` : t("appearance.radius.auto"))}
          onChange={(v) => setSetting(appearanceSettings.cornerRadius, v)}
        />
        <RangeRow
          label="appearance.scale.label"
          description="appearance.scale.desc"
          value={readSetting(values, appearanceSettings.scale)}
          min={0.9}
          max={1.2}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => setSetting(appearanceSettings.scale, v)}
        />
        <ChoiceRow
          label="appearance.density.label"
          description="appearance.density.desc"
          value={readSetting(values, appearanceSettings.density)}
          options={DENSITIES.map((d) => ({ value: d.id, label: d.label }))}
          onChange={(v) => setSetting(appearanceSettings.density, v as CompactDensity)}
        />
        <ChoiceRow
          label="appearance.animationSpeed.label"
          description="appearance.animationSpeed.desc"
          value={readSetting(values, appearanceSettings.animationSpeed)}
          options={SPEEDS.map((s) => ({ value: s.value, label: s.label }))}
          onChange={(v) => setSetting(appearanceSettings.animationSpeed, Number(v))}
        />
        <ChoiceRow
          label="appearance.borderSpeed.label"
          description="appearance.borderSpeed.desc"
          value={readSetting(values, appearanceSettings.borderSpeed)}
          options={BORDER_SPEEDS.map((s) => ({ value: s.value, label: s.label }))}
          onChange={(v) => setSetting(appearanceSettings.borderSpeed, Number(v))}
        />
        <ChoiceRow
          label="appearance.clockFormat.label"
          description="appearance.clockFormat.desc"
          value={readSetting(values, appearanceSettings.idleClockFormat)}
          options={CLOCK_FORMATS.map((c) => ({ value: c.id, label: c.label }))}
          onChange={(v) => setSetting(appearanceSettings.idleClockFormat, v as IdleClockFormat)}
        />
      </section>

      <motion.section
        className="settings-card"
        initial={false}
        animate={{ opacity: windows ? 1 : 0.4 }}
        style={{ pointerEvents: windows ? "auto" : "none" }}
      >
        <div className="settings-block">
          <div className="settings-row">
            <div className="settings-text">
              <span className="settings-label">{t("appearance.border.label")}</span>
              <span className="settings-desc">{windows ? t("appearance.border.desc") : t("appearance.windowsOnly")}</span>
            </div>
            <span className="settings-unit">
              {border === "custom" ? t("appearance.preset.custom") : t(BORDER_PRESETS.find((p) => p.id === border)?.name ?? "appearance.preset.none")}
            </span>
          </div>
          <div className="swatches">
            {BORDER_PRESETS.map((p) => (
              <Swatch
                key={p.id}
                fill={swatchBackground(p.colors)}
                outlined={!p.colors.length}
                title={t(p.name)}
                selected={border === p.id}
                onPick={() => setSetting(appearanceSettings.border, p.id)}
              />
            ))}
            <Swatch
              fill={swatchBackground(custom)}
              title={t("appearance.preset.custom")}
              selected={border === "custom"}
              onPick={() => setSetting(appearanceSettings.border, "custom")}
              edit
            />
          </div>
          {border === "custom" &&
            [0, 1].map((index) => (
              <div key={index} className="palette-row">
                <span className="settings-desc">{t(index ? "appearance.custom.end" : "appearance.custom.start")}</span>
                <div className="swatches">
                  {PALETTE.map((color) => (
                    <Swatch
                      key={color}
                      small
                      fill={color}
                      title={color}
                      selected={custom[index]?.toLowerCase() === color.toLowerCase()}
                      onPick={() => {
                        const next = [custom[0] ?? PALETTE[7], custom[1] ?? PALETTE[4]];
                        next[index] = color;
                        setSetting(appearanceSettings.customColors, next);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>

        <div className={`settings-row ${rim.length ? "" : "is-disabled"}`}>
          <div className="settings-text">
            <span className="settings-label">{t("appearance.thickness.label")}</span>
          </div>
          <div className="segmented">
            {THICKNESSES.map((n) => (
              <button
                key={n}
                className={thickness === n ? "is-active" : ""}
                disabled={!rim.length}
                onClick={() => setSetting(appearanceSettings.thickness, n)}
              >
                {t(`appearance.thickness.${n}`)}
              </button>
            ))}
          </div>
        </div>
        <ToggleRow def={appearanceSettings.animate} value={readSetting(values, appearanceSettings.animate)} />
        <ToggleRow def={appearanceSettings.glow} value={readSetting(values, appearanceSettings.glow)} />
        <ToggleRow def={appearanceSettings.idleClock} value={readSetting(values, appearanceSettings.idleClock)} />
      </motion.section>

      <section className="settings-card">
        <label className="settings-row">
          <div className="settings-text">
            <span className="settings-label">{t("appearance.hide.label")}</span>
            <span className="settings-desc">{t("appearance.hide.desc")}</span>
          </div>
          <Toggle checked={hidden} onChange={(v) => setSetting(ISLAND_HIDDEN_KEY, v)} />
        </label>
      </section>

      <section className="settings-card">
        <div className="settings-row">
          <div className="settings-text">
            <span className="settings-label">{t("appearance.reset.label")}</span>
            <span className="settings-desc">{t("appearance.reset.desc")}</span>
          </div>
          <button className="settings-btn" onClick={() => resetSettings(Object.values(appearanceSettings))}>
            {t("appearance.reset.button")}
          </button>
        </div>
      </section>
    </>
  );
}

function RangeRow({
  label,
  description,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: MessageKey;
  description: MessageKey;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const t = useT();
  return (
    <label className="settings-row">
      <div className="settings-text">
        <span className="settings-label">{t(label)}</span>
        <span className="settings-desc">{t(description)}</span>
      </div>
      <span className="settings-range">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="settings-range-value">{format(value)}</span>
      </span>
    </label>
  );
}

function ChoiceRow({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: MessageKey;
  description: MessageKey;
  value: string | number;
  options: { value: string | number; label: MessageKey }[];
  onChange: (value: string | number) => void;
}) {
  const t = useT();
  return (
    <div className="settings-row">
      <div className="settings-text">
        <span className="settings-label">{t(label)}</span>
        <span className="settings-desc">{t(description)}</span>
      </div>
      <div className="segmented">
        {options.map((option) => (
          <button
            key={String(option.value)}
            className={String(value) === String(option.value) ? "is-active" : ""}
            onClick={() => onChange(option.value)}
          >
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A miniature of each look. */
function StylePreview({ style, rim }: { style: IslandStyle; rim: string[] }) {
  const background = rimBackground(rim);
  return (
    <div className={`style-preview is-${style}`}>
      <div className="style-preview-island">
        {style === "windows" && (
          <span
            className={`rim ${background ? "" : "is-classic"}`}
            style={{ "--rim-bg": background, "--rim-w": "1.5px" } as CSSProperties}
          />
        )}
        {style === "windows" && <span className="style-preview-time">9:41</span>}
      </div>
    </div>
  );
}

function Swatch({
  fill,
  title,
  selected,
  onPick,
  outlined,
  small,
  edit,
}: {
  fill: string;
  title: string;
  selected: boolean;
  onPick: () => void;
  outlined?: boolean;
  small?: boolean;
  edit?: boolean;
}) {
  return (
    <button
      className={`swatch ${selected ? "is-selected" : ""} ${small ? "is-small" : ""}`}
      title={title}
      aria-pressed={selected}
      onClick={onPick}
    >
      <span className={`swatch-fill ${outlined ? "is-outlined" : ""}`} style={{ background: fill }}>
        {edit && "✎"}
      </span>
    </button>
  );
}
