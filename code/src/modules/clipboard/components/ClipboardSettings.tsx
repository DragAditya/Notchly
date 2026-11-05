import { useEffect, useState } from "react";
import { useT } from "../../../core/i18n";
import { resetSettings, setSetting, useSetting } from "../../../core/settings";
import { ToggleRow } from "../../../settings/components/Toggle";
import {
  clipboardSettings,
  type ClipboardPasteBehavior,
  type ScreenshotCardSize,
} from "../settings";

const TTL_OPTIONS = [1, 5, 10, 15, 30, 60, 120, 360, 1440];
const CUSTOM = "custom";
const MAX_TTL_MINUTES = 7 * 24 * 60;

/** Clipboard privacy and activation controls. */
export function ClipboardSettings() {
  const t = useT();
  const cleanup = useSetting(clipboardSettings.screenshotCleanup);
  const ttl = useSetting(clipboardSettings.screenshotTtlMinutes);
  const promptSeconds = useSetting(clipboardSettings.screenshotPromptSeconds);
  const cardSize = useSetting(clipboardSettings.screenshotCardSize);
  const retention = useSetting(clipboardSettings.retentionMinutes);
  const paste = useSetting(clipboardSettings.pasteBehavior);

  return (
    <div className="settings-block">
      <ToggleRow def={clipboardSettings.imagePreview} value={useSetting(clipboardSettings.imagePreview)} />

      <ScreenshotTtlRow
        value={ttl}
        disabled={!cleanup}
        onChange={(value) => setSetting(clipboardSettings.screenshotTtlMinutes, value)}
      />

      <ScreenshotPromptRow value={promptSeconds} disabled={!cleanup} />

      <ScreenshotCardSizeRow value={cardSize} disabled={!cleanup} />

      <label className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t(clipboardSettings.retentionMinutes.label)}</span>
          <span className="settings-desc">{t(clipboardSettings.retentionMinutes.description!)}</span>
        </div>
        <select
          className="settings-select"
          value={retention}
          onChange={(event) => setSetting(clipboardSettings.retentionMinutes, Number(event.target.value))}
        >
          <option value={0}>{t("clipboard.retention.never")}</option>
          {[5, 15, 30, 60, 240].map((value) => (
            <option key={value} value={value}>
              {value >= 60
                ? t("clipboard.retention.hours", { n: value / 60 })
                : t("clipboard.retention.minutes", { n: value })}
            </option>
          ))}
        </select>
      </label>

      <label className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t(clipboardSettings.pasteBehavior.label)}</span>
          <span className="settings-desc">{t(clipboardSettings.pasteBehavior.description!)}</span>
        </div>
        <select
          className="settings-select"
          value={paste}
          onChange={(event) => setSetting(clipboardSettings.pasteBehavior, event.target.value as ClipboardPasteBehavior)}
        >
          <option value="copy">{t("clipboard.paste.copy")}</option>
          <option value="paste">{t("clipboard.paste.paste")}</option>
        </select>
      </label>

      <div className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t("clipboard.reset.label")}</span>
          <span className="settings-desc">{t("clipboard.reset.desc")}</span>
        </div>
        <button className="settings-btn" onClick={() => resetSettings(Object.values(clipboardSettings))}>
          {t("clipboard.reset.button")}
        </button>
      </div>
    </div>
  );
}

/** How long the screenshot card stays open before it folds back to the pill. */
function ScreenshotPromptRow({ value, disabled }: { value: number; disabled: boolean }) {
  const t = useT();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(draft));
    if (Number.isFinite(n) && n >= 1 && n <= 60) setSetting(clipboardSettings.screenshotPromptSeconds, n);
    else setDraft(String(value));
  };

  return (
    <div className={`settings-row is-static${disabled ? " is-disabled" : ""}`}>
      <span className="settings-text">
        <span className="settings-label">{t("clipboard.screenshotPrompt.label")}</span>
        <span className="settings-desc">{t("clipboard.screenshotPrompt.desc")}</span>
      </span>
      <span className="settings-number">
        <input
          type="number"
          min={1}
          max={60}
          step={1}
          value={draft}
          disabled={disabled}
          aria-label={t("clipboard.screenshotPrompt.label")}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        />
        <span className="settings-unit">{t("clipboard.screenshotPrompt.seconds")}</span>
      </span>
    </div>
  );
}

/** Three fixed sizes keep the card readable without a free-form drag handle. */
function ScreenshotCardSizeRow({ value, disabled }: { value: ScreenshotCardSize; disabled: boolean }) {
  const t = useT();
  return (
    <label className={`settings-row${disabled ? " is-disabled" : ""}`}>
      <span className="settings-text">
        <span className="settings-label">{t(clipboardSettings.screenshotCardSize.label)}</span>
        <span className="settings-desc">{t(clipboardSettings.screenshotCardSize.description!)}</span>
      </span>
      <select
        className="settings-select"
        value={value}
        disabled={disabled}
        aria-label={t(clipboardSettings.screenshotCardSize.label)}
        onChange={(event) =>
          setSetting(clipboardSettings.screenshotCardSize, event.target.value as ScreenshotCardSize)
        }
      >
        <option value="compact">{t("clipboard.screenshotCardSize.compact")}</option>
        <option value="balanced">{t("clipboard.screenshotCardSize.balanced")}</option>
        <option value="large">{t("clipboard.screenshotCardSize.large")}</option>
      </select>
    </label>
  );
}

/** Presets plus any whole number of minutes. */
function ScreenshotTtlRow({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const t = useT();
  const [custom, setCustom] = useState(!TTL_OPTIONS.includes(value));
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  useEffect(() => {
    if (!TTL_OPTIONS.includes(value)) setCustom(true);
  }, [value]);
  const commit = () => {
    const n = Math.round(Number(draft));
    if (Number.isFinite(n) && n >= 1 && n <= MAX_TTL_MINUTES) onChange(n);
    else setDraft(String(value));
  };

  return (
    <div className={`settings-row is-static${disabled ? " is-disabled" : ""}`}>
      <span className="settings-text">
        <span className="settings-label">{t("clipboard.screenshotTtl.label")}</span>
        <span className="settings-desc">{t("clipboard.screenshotTtl.desc")}</span>
      </span>
      <span className="settings-inline">
        {custom && (
          <span className="settings-number">
            <input
              type="number"
              min={1}
              max={MAX_TTL_MINUTES}
              step={1}
              value={draft}
              disabled={disabled}
              aria-label={t("clipboard.screenshotTtl.label")}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            />
            <span className="settings-unit">{t("clipboard.screenshotTtl.min")}</span>
          </span>
        )}
        <select
          className="settings-select"
          value={custom ? CUSTOM : value}
          disabled={disabled}
          aria-label={t("clipboard.screenshotTtl.label")}
          onChange={(event) => {
            if (event.target.value === CUSTOM) return setCustom(true);
            setCustom(false);
            onChange(Number(event.target.value));
          }}
        >
          {TTL_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes >= 60
                ? t("clipboard.retention.hours", { n: minutes / 60 })
                : t("clipboard.retention.minutes", { n: minutes })}
            </option>
          ))}
          <option value={CUSTOM}>{t("clipboard.screenshotTtl.custom")}</option>
        </select>
      </span>
    </div>
  );
}
