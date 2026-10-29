import { useEffect, useState } from "react";
import { useT } from "../../../core/i18n";
import { setSetting, useSetting } from "../../../core/settings";
import { Toggle } from "../../../settings/components/Toggle";
import { lyricsSettings } from "../settings";
import { SpotifySettings } from "./SpotifySettings";

/** The music module's settings: lyrics first, then the Spotify account block. */
export function MusicSettings() {
  return (
    <>
      <LyricsSettings />
      <SpotifySettings />
    </>
  );
}

function LyricsSettings() {
  const t = useT();
  const enabled = useSetting(lyricsSettings.enabled);
  const mode = useSetting(lyricsSettings.mode);

  return (
    <div className="settings-block">
      <div className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t("music.lyrics.label")}</span>
          <span className="settings-desc">{t("music.lyrics.desc")}</span>
        </div>
        <Toggle checked={enabled} onChange={(v) => setSetting(lyricsSettings.enabled, v)} />
      </div>

      <div className={`settings-row is-static ${enabled ? "" : "is-disabled"}`}>
        <div className="settings-text">
          <span className="settings-label">{t("music.lyrics.modeLabel")}</span>
        </div>
        <div className="segmented">
          <button
            type="button"
            disabled={!enabled}
            className={mode === "line" ? "is-active" : ""}
            onClick={() => setSetting(lyricsSettings.mode, "line")}
          >
            {t("music.lyrics.line")}
          </button>
          <button
            type="button"
            disabled={!enabled}
            className={mode === "word" ? "is-active" : ""}
            onClick={() => setSetting(lyricsSettings.mode, "word")}
          >
            {t("music.lyrics.word")}
          </button>
        </div>
      </div>

      <OffsetRow disabled={!enabled} />
    </div>
  );
}

/** Positive values show the lyrics later; negative, earlier. */function OffsetRow({ disabled }: { disabled: boolean }) {
  const t = useT();
  const value = useSetting(lyricsSettings.offset);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const n = Math.round(Number(draft) * 10) / 10;
    if (Number.isFinite(n) && n >= -5 && n <= 5) setSetting(lyricsSettings.offset, n);
    else setDraft(String(value));
  };

  return (
    <div className={`settings-row is-static ${disabled ? "is-disabled" : ""}`}>
      <div className="settings-text">
        <span className="settings-label">{t("music.lyrics.offsetLabel")}</span>
        <span className="settings-desc">{t("music.lyrics.offsetDesc")}</span>
      </div>
      <div className="lyrics-offset">
        {value !== 0 && (
          <button
            type="button"
            className="settings-btn"
            disabled={disabled}
            onClick={() => setSetting(lyricsSettings.offset, 0)}
          >
            {t("music.lyrics.reset")}
          </button>
        )}
        <span className="settings-number">
          <input
            type="number"
            min={-5}
            max={5}
            step={0.1}
            value={draft}
            disabled={disabled}
            aria-label={t("music.lyrics.offsetLabel")}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <span className="settings-unit">s</span>
        </span>
      </div>
    </div>
  );
}
