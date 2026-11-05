import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router";
import { command, isTauri, useTauriEvent } from "../../core/bridge";
import { useT, type MessageKey } from "../../core/i18n";
import {
  appearanceSettings,
  companionSettings,
  generalSettings,
  layoutSettings,
  moduleEnabled,
  monitorSettings,
  positionSettings,
  readSetting,
  setSetting,
  shortcutSettings,
  type SettingDef,
  type Values,
} from "../../core/settings";
import { languageSetting } from "../../core/i18n";
import { askCompact, askGeminiKey, askGeminiModel, askInstantShortcut } from "../../modules/ask/settings";
import { calendarVisibility, remindMinutes } from "../../modules/clock/settings";
import { clipboardSettings } from "../../modules/clipboard/settings";
import { githubRepos } from "../../modules/github/settings";
import { hydrationInterval, hydrationSnooze } from "../../modules/hydration/settings";
import { lyricsSettings, musicSourceSettings } from "../../modules/music/settings";
import { shelfSettings } from "../../modules/shelf/settings";
import { modules } from "../../modules";

/** Never print a credential in a search result. */
const SECRET_KEYS = new Set([askGeminiKey.key]);

type AnyDef = SettingDef<any>;

interface Section {
  id: string;
  label: MessageKey;
  path: string;
  defs: AnyDef[];
}

interface ShortcutConflict {
  key: string;
  combo: string;
  reason: string;
}

const EXTRA: Record<string, AnyDef[]> = {
  ask: [askCompact, askGeminiKey, askGeminiModel, askInstantShortcut],
  clock: [remindMinutes, calendarVisibility],
  github: [githubRepos],
  hydration: [hydrationInterval, hydrationSnooze],
  music: [...Object.values(lyricsSettings), ...Object.values(musicSourceSettings)],
  shelf: Object.values(shelfSettings),
  clipboard: Object.values(clipboardSettings),
};

function dedupe(defs: AnyDef[]): AnyDef[] {
  const seen = new Set<string>();
  return defs.filter((def) => {
    if (seen.has(def.key)) return false;
    seen.add(def.key);
    return true;
  });
}

function allSections(): Section[] {
  const core: Section[] = [
    {
      id: "general",
      label: "settings.general",
      path: "/",
      defs: dedupe([
        languageSetting,
        ...Object.values(generalSettings),
        ...Object.values(monitorSettings),
        ...Object.values(positionSettings),
      ]),
    },
    {
      id: "appearance",
      label: "appearance.title",
      path: "/appearance",
      defs: Object.values(appearanceSettings),
    },
    {
      id: "companion",
      label: "companion.title",
      path: "/companion",
      defs: Object.values(companionSettings),
    },
    {
      id: "advanced",
      label: "settings.advanced",
      path: "/advanced",
      defs: [...Object.values(shortcutSettings), askInstantShortcut],
    },
    {
      id: "layout",
      label: "modules.title",
      path: "/modules",
      defs: Object.values(layoutSettings),
    },
  ];

  const moduleSections = modules.map((module): Section => ({
    id: `module:${module.id}`,
    label: module.title,
    path: `/modules/${module.id}`,
    defs: dedupe([moduleEnabled(module), ...(module.settings ?? []), ...(EXTRA[module.id] ?? [])]),
  }));

  return [...core, ...moduleSections];
}

const SHORTCUTS: AnyDef[] = [
  shortcutSettings.ask,
  shortcutSettings.find,
  shortcutSettings.companionSummon,
  shortcutSettings.companionToggle,
  shortcutSettings.notchLock,
  askInstantShortcut,
];

/** Search every setting, move data in and out, reset a section, edit shortcuts. */
export function AdvancedPage({ values }: { values: Values }) {
  const t = useT();
  const sections = useMemo(allSections, []);
  const [query, setQuery] = useState("");
  const [resetSection, setResetSection] = useState("general");
  const [status, setStatus] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const results = q
    ? sections
        .map((section) => ({
          ...section,
          defs: section.defs.filter((def) => {
            const value = readSetting(values, def);
            const haystack = [
              t(def.label),
              def.description ? t(def.description) : "",
              def.key,
              SECRET_KEYS.has(def.key) ? "" : String(value ?? ""),
            ]
              .join(" ")
              .toLowerCase();
            return haystack.includes(q);
          }),
        }))
        .filter((section) => section.defs.length > 0)
    : [];

  const selected = sections.find((section) => section.id === resetSection) ?? sections[0];

  const reset = async (keys: string[]) => {
    if (!window.confirm(t("advanced.reset.confirm"))) return;
    if (isTauri) {
      await command("reset_settings", { keys });
      setStatus(t("advanced.reset.done"));
    } else {
      localStorage.removeItem("island-settings");
      location.reload();
    }
  };

  const exportFile = async () => {
    const json = isTauri
      ? await command<string>("export_settings")
      : JSON.stringify(JSON.parse(localStorage.getItem("island-settings") ?? "{}"), null, 2);
    const blob = new Blob([json ?? "{}"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "notchly-settings.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus(t("advanced.export.done"));
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
      if (isTauri) {
        await command("import_settings", { json: text });
      } else {
        localStorage.setItem("island-settings", JSON.stringify(parsed));
        location.reload();
      }
      setStatus(t("advanced.import.done"));
    } catch {
      setStatus(t("advanced.import.invalid"));
    }
  };

  return (
    <>
      <h1 className="settings-title">{t("settings.advanced")}</h1>

      <section className="settings-card">
        <label className="settings-row advanced-search">
          <div className="settings-text">
            <span className="settings-label">{t("advanced.search.label")}</span>
            <span className="settings-desc">{t("advanced.search.desc")}</span>
          </div>
          <input
            className="settings-input"
            type="search"
            value={query}
            placeholder={t("advanced.search.placeholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {q && !results.length && <span className="advanced-status">{t("advanced.search.empty")}</span>}
        {results.map((section) => (
          <div className="advanced-group" key={section.id}>
            <span className="advanced-group-title">{t(section.label)}</span>
            {section.defs.map((def) => (
              <Link className="advanced-result" to={section.path} key={def.key}>
                <span className="advanced-result-text">
                  <span className="settings-label">{t(def.label)}</span>
                  <span className="settings-desc">
                    {def.key} ·{" "}
                    {SECRET_KEYS.has(def.key) ? "••••" : formatValue(t, readSetting(values, def))}
                  </span>
                </span>
                <span className="advanced-section">{t(section.label)}</span>
              </Link>
            ))}
          </div>
        ))}
      </section>

      <section className="settings-card">
        <div className="settings-row">
          <div className="settings-text">
            <span className="settings-label">{t("advanced.export.label")}</span>
            <span className="settings-desc">{t("advanced.export.desc")}</span>
          </div>
          <button className="settings-btn" onClick={exportFile}>
            {t("advanced.export.button")}
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-text">
            <span className="settings-label">{t("advanced.import.label")}</span>
            <span className="settings-desc">{t("advanced.import.desc")}</span>
          </div>
          <button className="settings-btn" onClick={() => fileInput.current?.click()}>
            {t("advanced.import.button")}
          </button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={importFile} />
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-row">
          <div className="settings-text">
            <span className="settings-label">{t("advanced.reset.sectionLabel")}</span>
            <span className="settings-desc">{t("advanced.reset.sectionDesc")}</span>
          </div>
          <div className="advanced-inline">
            <select
              className="settings-select"
              value={selected.id}
              onChange={(event) => setResetSection(event.target.value)}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {t(section.label)}
                </option>
              ))}
            </select>
            <button className="settings-btn" onClick={() => reset(selected.defs.map((def) => def.key))}>
              {t("advanced.reset.sectionButton")}
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-text">
            <span className="settings-label">{t("advanced.reset.allLabel")}</span>
            <span className="settings-desc">{t("advanced.reset.allDesc")}</span>
          </div>
          <button className="settings-btn danger" onClick={() => reset([])}>
            {t("advanced.reset.allButton")}
          </button>
        </div>
        {status && <span className="advanced-status">{status}</span>}
      </section>

      <ShortcutEditor values={values} />
    </>
  );
}

function formatValue(t: ReturnType<typeof useT>, value: unknown): string {
  if (typeof value === "boolean") return t(value ? "advanced.value.on" : "advanced.value.off");
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (value == null || value === "") return "—";
  return String(value);
}

function ShortcutEditor({ values }: { values: Values }) {
  const t = useT();
  const [recording, setRecording] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ShortcutConflict[]>([]);

  const refreshConflicts = useCallback(() => {
    if (!isTauri) return;
    command<ShortcutConflict[]>("get_shortcut_conflicts")
      .then((list) => setConflicts(list ?? []))
      .catch(() => setConflicts([]));
  }, []);

  useEffect(refreshConflicts, [refreshConflicts]);
  useTauriEvent("settings://changed", refreshConflicts);

  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(null);
        setError(null);
        return;
      }
      const combo = comboOf(event);
      if (!combo) {
        setError(t("advanced.shortcuts.invalid"));
        return;
      }
      const def = SHORTCUTS.find((item) => item.key === recording);
      if (def) void save(def, combo);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, t]);

  async function save(def: AnyDef, combo: string) {
    setError(null);
    try {
      if (isTauri) await command("set_shortcut", { key: def.key, combo });
      setSetting(def, combo);
      setConflicts((current) => current.filter((conflict) => conflict.key !== def.key));
      setRecording(null);
    } catch (reason) {
      const message = String(reason);
      setError(message.includes("taken") ? t("advanced.shortcuts.taken") : t("advanced.shortcuts.invalid"));
    }
  }

  return (
    <section className="settings-card">
      <div className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t("advanced.shortcuts.label")}</span>
          <span className="settings-desc">{t("advanced.shortcuts.desc")}</span>
        </div>
      </div>
      {conflicts.length > 0 && (
        <div className="advanced-conflict" role="alert">
          <span className="advanced-conflict-title">{t("advanced.shortcuts.conflictTitle")}</span>
          {conflicts.map((conflict) => {
            const def = SHORTCUTS.find((item) => item.key === conflict.key);
            return (
              <span className="advanced-status is-error" key={conflict.key}>
                {t("advanced.shortcuts.conflict", {
                  name: def ? t(def.label) : conflict.key,
                  combo: conflict.combo,
                })}
              </span>
            );
          })}
        </div>
      )}
      {SHORTCUTS.map((def) => {
        const value = readSetting(values, def);
        return (
          <div className="settings-row advanced-shortcut" key={def.key}>
            <div className="settings-text">
              <span className="settings-label">{t(def.label)}</span>
              {def.description && <span className="settings-desc">{t(def.description)}</span>}
            </div>
            <div className="advanced-inline">
              <kbd className="advanced-keys">{value || t("advanced.shortcuts.off")}</kbd>
              <button
                className={`settings-btn ${recording === def.key ? "primary" : ""}`}
                onClick={() => {
                  setError(null);
                  setRecording(def.key);
                }}
              >
                {recording === def.key ? t("advanced.shortcuts.recording") : t("advanced.shortcuts.set")}
              </button>
              {value && (
                <button className="settings-btn" onClick={() => void save(def, "")}>
                  {t("advanced.shortcuts.clear")}
                </button>
              )}
            </div>
          </div>
        );
      })}
      {error && <span className="advanced-status is-error">{error}</span>}
    </section>
  );
}

function comboOf(event: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (event.ctrlKey) mods.push("Ctrl");
  if (event.altKey) mods.push("Alt");
  if (event.shiftKey) mods.push("Shift");
  if (event.metaKey) mods.push("Super");
  if (!mods.length) return null;

  const key = event.key;
  const normalized = /^[a-zA-Z]$/.test(key)
    ? key.toUpperCase()
    : /^[0-9]$/.test(key)
      ? key
      : /^F([1-9]|1[0-9]|2[0-4])$/.test(key)
        ? key
        : key === " "
          ? "Space"
          : /^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Insert|Delete|Enter|Tab)$/.test(key)
            ? key
            : null;
  if (!normalized) return null;
  return [...mods, normalized].join("+");
}
