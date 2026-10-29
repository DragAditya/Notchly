import { useEffect, useState, type FormEvent } from "react";
import { command, isTauri } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { setSetting, useSetting } from "../../../core/settings";
import { askGeminiKey, askGeminiModel, askInstantShortcut } from "../settings";

const KEY_URL = "https://aistudio.google.com/apikey";

/** Gemini API key + model, compact mode, and the instant-prompt shortcut. */
export function AskSettings() {
  const t = useT();
  const key = useSetting(askGeminiKey);
  const model = useSetting(askGeminiModel);
  const shortcut = useSetting(askInstantShortcut);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [recording, setRecording] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  const save = (e: FormEvent) => {
    e.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setSetting(askGeminiKey, value);
    setDraft("");
    setSaved(true);
  };

  /** Register (or clear) the shortcut in the backend, then keep the setting in sync. */
  async function saveShortcut(combo: string) {
    setShortcutError(null);
    try {
      if (isTauri) await command("set_instant_shortcut", { combo });
      setSetting(askInstantShortcut, combo);
      setRecording(false);
    } catch (error) {
      const message = String(error);
      setShortcutError(message.includes("taken") ? t("ask.instant.taken") : t("ask.instant.invalid"));
      setRecording(false);
    }
  }

  // While recording: the next combination is the shortcut (Esc cancels).
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        setShortcutError(null);
        return;
      }
      if ((e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        void saveShortcut("");
        return;
      }
      const key = keyName(e);
      if (!key) return;
      const mods: string[] = [];
      if (e.ctrlKey) mods.push("Ctrl");
      if (e.altKey) mods.push("Alt");
      if (e.shiftKey) mods.push("Shift");
      if (e.metaKey) mods.push("Super");
      if (!mods.length) {
        setShortcutError(t("ask.instant.hint"));
        return;
      }
      void saveShortcut([...mods, key].join("+"));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  return (
    <div className="settings-block">
      <div className="settings-text">
        <span className="settings-label">{t("ask.gemini.title")}</span>
        <span className="settings-desc">{t("ask.gemini.desc")}</span>
      </div>

      <form className="ask-settings-form" onSubmit={save}>
        <input
          className="settings-input"
          type="password"
          value={draft}
          placeholder={key ? t("ask.gemini.keyReplace") : t("ask.gemini.keyPlaceholder")}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
          }}
        />
        <button className="settings-btn primary" disabled={!draft.trim()}>
          {t("ask.gemini.save")}
        </button>
      </form>

      <div className="ask-settings-status">
        <span className="settings-desc">{saved ? t("ask.gemini.saved") : key ? t("ask.gemini.keySaved") : t("ask.gemini.keyMissing")}</span>
        {key && (
          <button
            className="ask-link"
            onClick={() => {
              setSetting(askGeminiKey, "");
              setSaved(false);
            }}
          >
            {t("ask.gemini.remove")}
          </button>
        )}
      </div>

      <span className="settings-desc">
        {t("ask.gemini.keyHow")}{" "}
        <button className="ask-link" onClick={() => command("open_external", { url: KEY_URL })}>
          {t("ask.gemini.keyCreate")}
        </button>
      </span>

      <label className="settings-row is-static">
        <div className="settings-text">
          <span className="settings-label">{t("ask.gemini.model")}</span>
          <span className="settings-desc">{t("ask.gemini.modelDesc")}</span>
        </div>
        <input
          className="settings-input ask-model-input"
          value={model}
          placeholder="gemini-2.5-flash"
          spellCheck={false}
          onChange={(e) => setSetting(askGeminiModel, e.target.value)}
        />
      </label>

      <div className="settings-row is-static">
        <div className="settings-text">
          <span className="settings-label">{t("ask.instant.label")}</span>
          <span className="settings-desc">{t("ask.instant.desc")}</span>
        </div>
        <div className="ask-shortcut">
          <button
            className={`ask-keycap ${recording ? "is-recording" : ""}`}
            onClick={() => {
              setShortcutError(null);
              setRecording((value) => !value);
            }}
          >
            {recording ? (
              t("ask.instant.recording")
            ) : shortcut ? (
              shortcut.split("+").map((part) => <kbd key={part}>{displayKey(part)}</kbd>)
            ) : (
              t("ask.instant.set")
            )}
          </button>
          {shortcut && !recording && (
            <button
              className="ask-shortcut-clear"
              title={t("ask.instant.clear")}
              onClick={() => saveShortcut("")}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {shortcutError && <span className="settings-desc ask-shortcut-error">{shortcutError}</span>}
    </div>
  );
}

/** "Ctrl", "A", "F9"… for the keycap. */
function displayKey(part: string) {
  return part === "Super" ? "Win" : part;
}

/** The key part of a press, in the backend's accelerator names. */
function keyName(e: KeyboardEvent): string | null {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.code)) return e.code;
  const named: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    Tab: "Tab",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Insert: "Insert",
    Delete: "Delete",
  };
  return named[e.code] ?? null;
}
