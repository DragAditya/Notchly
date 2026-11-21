import { useEffect, useState } from "react";
import { useT } from "../../../core/i18n";
import { setSetting, useSetting } from "../../../core/settings";
import { Toggle, ToggleRow } from "../../../settings/components/Toggle";
import {
  lyricsBoardSettings,
  lyricsSettings,
  musicSettings,
  musicSourceSettings,
  type BoardEmptyAnim,
  type MusicSource,
} from "../settings";
import { SpotifySettings } from "./SpotifySettings";

/** The music module's settings: display, lyrics, board, then the Spotify block. */
export function MusicSettings() {
  return (
    <>
      <DisplaySettings />
      <LyricsSettings />
      <BoardSettings />
      <SpotifySettings />
    </>
  );
}

/** The pop-out lyrics board: trigger, empty states and backdrop strength. */
function BoardSettings() {
  const t = useT();
  const enabled = useSetting(lyricsBoardSettings.enabled);
  const anim = useSetting(lyricsBoardSettings.emptyAnim);
  const showEmptyText = useSetting(lyricsBoardSettings.showEmptyText);
  const nothing = useSetting(lyricsBoardSettings.nothingText);
  const noLyrics = useSetting(lyricsBoardSettings.noLyricsText);
  const tint = useSetting(lyricsBoardSettings.tint);
  const blur = useSetting(lyricsBoardSettings.bgBlur);
  const autoHide = useSetting(lyricsBoardSettings.autoHideButtons);

  return (
    <div className="settings-block">
      <div className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t(lyricsBoardSettings.enabled.label)}</span>
          <span className="settings-desc">{t(lyricsBoardSettings.enabled.description!)}</span>
        </div>
        <Toggle checked={enabled} onChange={(v) => setSetting(lyricsBoardSettings.enabled, v)} />
      </div>

      <label className={`settings-row ${enabled ? "" : "is-disabled"}`}>
        <div className="settings-text">
          <span className="settings-label">{t(lyricsBoardSettings.emptyAnim.label)}</span>
          <span className="settings-desc">{t(lyricsBoardSettings.emptyAnim.description!)}</span>
        </div>
        <select
          className="settings-select"
          disabled={!enabled}
          value={anim}
          onChange={(e) => setSetting(lyricsBoardSettings.emptyAnim, e.target.value as BoardEmptyAnim)}
        >
          <option value="face">{t("music.board.emptyAnim.face")}</option>
          <option value="bars">{t("music.board.emptyAnim.bars")}</option>
          <option value="notes">{t("music.board.emptyAnim.notes")}</option>
          <option value="none">{t("music.board.emptyAnim.none")}</option>
        </select>
      </label>

      <div className={`settings-row ${enabled ? "" : "is-disabled"}`}>
        <div className="settings-text">
          <span className="settings-label">{t(lyricsBoardSettings.showEmptyText.label)}</span>
          <span className="settings-desc">{t(lyricsBoardSettings.showEmptyText.description!)}</span>
        </div>
        <Toggle
          checked={showEmptyText}
          disabled={!enabled}
          onChange={(v) => setSetting(lyricsBoardSettings.showEmptyText, v)}
        />
      </div>

      <label className={`settings-row ${enabled ? "" : "is-disabled"}`}>
        <div className="settings-text">
          <span className="settings-label">{t(lyricsBoardSettings.nothingText.label)}</span>
          <span className="settings-desc">{t(lyricsBoardSettings.nothingText.description!)}</span>
        </div>
        <input
          className="settings-input lyrics-board-text"
          disabled={!enabled}
          value={nothing}
          placeholder={t("music.board.nothingPlaying")}
          maxLength={80}
          onChange={(e) => setSetting(lyricsBoardSettings.nothingText, e.target.value)}
        />
      </label>

      <label className={`settings-row ${enabled ? "" : "is-disabled"}`}>
        <div className="settings-text">
          <span className="settings-label">{t(lyricsBoardSettings.noLyricsText.label)}</span>
          <span className="settings-desc">{t(lyricsBoardSettings.noLyricsText.description!)}</span>
        </div>
        <input
          className="settings-input lyrics-board-text"
          disabled={!enabled}
          value={noLyrics}
          placeholder={t("music.board.noLyrics")}
          maxLength={80}
          onChange={(e) => setSetting(lyricsBoardSettings.noLyricsText, e.target.value)}
        />
      </label>

      <label className={`settings-row ${enabled ? "" : "is-disabled"}`}>
        <div className="settings-text">
          <span className="settings-label">{t(lyricsBoardSettings.tint.label)}</span>
          <span className="settings-desc">{t(lyricsBoardSettings.tint.description!)}</span>
        </div>
        <span className="settings-range">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            disabled={!enabled}
            value={tint}
            onChange={(e) => setSetting(lyricsBoardSettings.tint, Number(e.target.value))}
          />
          <span className="settings-range-value">{tint}%</span>
        </span>
      </label>

      <label className={`settings-row ${enabled ? "" : "is-disabled"}`}>
        <div className="settings-text">
          <span className="settings-label">{t(lyricsBoardSettings.bgBlur.label)}</span>
          <span className="settings-desc">{t(lyricsBoardSettings.bgBlur.description!)}</span>
        </div>
        <span className="settings-range">
          <input
            type="range"
            min={0}
            max={80}
            step={4}
            disabled={!enabled}
            value={blur}
            onChange={(e) => setSetting(lyricsBoardSettings.bgBlur, Number(e.target.value))}
          />
          <span className="settings-range-value">{blur}px</span>
        </span>
      </label>

      <div className={`settings-row ${enabled ? "" : "is-disabled"}`}>
        <div className="settings-text">
          <span className="settings-label">{t(lyricsBoardSettings.autoHideButtons.label)}</span>
          <span className="settings-desc">{t(lyricsBoardSettings.autoHideButtons.description!)}</span>
        </div>
        <Toggle
          checked={autoHide}
          disabled={!enabled}
          onChange={(v) => setSetting(lyricsBoardSettings.autoHideButtons, v)}
        />
      </div>
    </div>
  );
}

function DisplaySettings() {
  const t = useT();
  const source = useSetting(musicSourceSettings.sourcePriority);

  return (
    <div className="settings-block">
      <ToggleRow def={musicSettings.showArtwork} value={useSetting(musicSettings.showArtwork)} />
      <ToggleRow def={musicSettings.artLookup} value={useSetting(musicSettings.artLookup)} />
      <ToggleRow def={musicSettings.showProgress} value={useSetting(musicSettings.showProgress)} />
      <ToggleRow def={musicSettings.hideWhenPaused} value={useSetting(musicSettings.hideWhenPaused)} />
      <label className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t(musicSourceSettings.sourcePriority.label)}</span>
          <span className="settings-desc">{t(musicSourceSettings.sourcePriority.description!)}</span>
        </div>
        <select
          className="settings-select"
          value={source}
          onChange={(event) => setSetting(musicSourceSettings.sourcePriority, event.target.value as MusicSource)}
        >
          <option value="system">{t("music.source.system")}</option>
          <option value="spotify">{t("music.source.spotify")}</option>
          <option value="browser">{t("music.source.browser")}</option>
        </select>
      </label>
    </div>
  );
}

function LyricsSettings() {
  const t = useT();
  const enabled = useSetting(lyricsSettings.enabled);
  const mode = useSetting(lyricsSettings.mode);
  const hinglish = useSetting(lyricsSettings.preferHinglish);

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

      <div className={`settings-row ${enabled ? "" : "is-disabled"}`}>
        <div className="settings-text">
          <span className="settings-label">{t("music.lyrics.hinglishLabel")}</span>
          <span className="settings-desc">{t("music.lyrics.hinglishDesc")}</span>
        </div>
        <Toggle
          checked={hinglish}
          disabled={!enabled}
          onChange={(v) => setSetting(lyricsSettings.preferHinglish, v)}
        />
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
