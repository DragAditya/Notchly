import { useT } from "../../../core/i18n";
import { resetSettings, setSetting, useSetting } from "../../../core/settings";
import { shelfSettings, type ShelfDropBehavior } from "../settings";

/** Shelf limits and what dropping a file on it does. */
export function ShelfSettings() {
  const t = useT();
  const maxItems = useSetting(shelfSettings.maxItems);
  const autoClear = useSetting(shelfSettings.autoClearMinutes);
  const dropBehavior = useSetting(shelfSettings.dropBehavior);

  return (
    <div className="settings-block">
      <label className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t(shelfSettings.maxItems.label)}</span>
          <span className="settings-desc">{t(shelfSettings.maxItems.description!)}</span>
        </div>
        <select
          className="settings-select"
          value={maxItems}
          onChange={(event) => setSetting(shelfSettings.maxItems, Number(event.target.value))}
        >
          {[4, 8, 12, 16, 20].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <label className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t(shelfSettings.autoClearMinutes.label)}</span>
          <span className="settings-desc">{t(shelfSettings.autoClearMinutes.description!)}</span>
        </div>
        <select
          className="settings-select"
          value={autoClear}
          onChange={(event) => setSetting(shelfSettings.autoClearMinutes, Number(event.target.value))}
        >
          <option value={0}>{t("shelf.settings.autoClear.never")}</option>
          {[5, 15, 30, 60].map((value) => (
            <option key={value} value={value}>
              {t("shelf.settings.autoClear.minutes", { n: value })}
            </option>
          ))}
        </select>
      </label>

      <label className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t(shelfSettings.dropBehavior.label)}</span>
          <span className="settings-desc">{t(shelfSettings.dropBehavior.description!)}</span>
        </div>
        <select
          className="settings-select"
          value={dropBehavior}
          onChange={(event) => setSetting(shelfSettings.dropBehavior, event.target.value as ShelfDropBehavior)}
        >
          <option value="link">{t("shelf.settings.drop.link")}</option>
          <option value="copy">{t("shelf.settings.drop.copy")}</option>
          <option value="move">{t("shelf.settings.drop.move")}</option>
        </select>
      </label>

      <div className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t("shelf.settings.reset.label")}</span>
          <span className="settings-desc">{t("shelf.settings.reset.desc")}</span>
        </div>
        <button className="settings-btn" onClick={() => resetSettings(Object.values(shelfSettings))}>
          {t("shelf.settings.reset.button")}
        </button>
      </div>
    </div>
  );
}
