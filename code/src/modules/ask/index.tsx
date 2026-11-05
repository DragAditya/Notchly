/**
 * Ask Gemini — a short-answer conversation powered by the Gemini API. Ctrl+Alt+Space
 * opens it from anywhere; the camera button attaches a screenshot of the window
 * you were in, and files dropped on it (or sent from the shelf) become
 * attachments. Backend: `src-tauri/src/providers/ask/`.
 *
 * In compact mode (the default) opening Ask shows only the prompt line. The
 * island collapses while Gemini thinks and unfolds again with the answer.
 */
import { motion } from "motion/react";
import { useEffect } from "react";
import { SparkleIcon } from "../../components/icons";
import { useProvider } from "../../core/bridge";
import { useT } from "../../core/i18n";
import { useSetting } from "../../core/settings";
import type { IslandModule, ModuleView } from "../../core/types";
import { AskCompact } from "./components/AskCompact";
import { AskIslandAnswer } from "./components/AskIslandAnswer";
import { AskPanel, statusText } from "./components/AskPanel";
import { AskSettings } from "./components/AskSettings";
import {
  ASK_PROVIDER,
  chatRequest,
  compactWaiting,
  GEMINI_BLUE,
  instantPrompt,
  islandAnswer,
  pendingAttachments,
  type AskState,
} from "./store";
import { askCompact } from "./settings";
import "./ask.css";

export const askModule: IslandModule = {
  id: "ask",
  title: "ask.title",
  settingsIcon: (
    <span style={{ color: GEMINI_BLUE, display: "grid" }}>
      <SparkleIcon size={15} />
    </span>
  ),
  settings: [askCompact],
  SettingsSection: AskSettings,
  useView(): ModuleView {
    const state = useProvider<AskState>(ASK_PROVIDER);
    const attachments = pendingAttachments.use();
    const compactSetting = useSetting(askCompact);
    const instant = instantPrompt.use();
    const waiting = compactWaiting.use();
    const answer = islandAnswer.use();
    const wantsChat = chatRequest.use();
    const t = useT();
    const running = !!state?.running;
    const messages = state?.messages.length ?? 0;
    const last = state?.messages[messages - 1];
    const lastText = last?.text ?? "";

    // A compact question came back: hand the reply to the island's answer
    // surface. `Island` opens it (`useView` runs outside the island context).
    useEffect(() => {
      if (waiting == null) return;
      if (messages < waiting || !last || last.fromUser || !lastText.trim()) return;
      compactWaiting.set(null);
      islandAnswer.set(last);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [waiting, messages, lastText, last?.fromUser]);

    const glyph = (size: number) => (
      <motion.span
        style={{ color: GEMINI_BLUE, display: "grid" }}
        animate={running ? { rotate: 360 } : { rotate: 0 }}
        transition={running ? { duration: 2.4, repeat: Infinity, ease: "linear" } : { duration: 0.3 }}
      >
        <SparkleIcon size={size} />
      </motion.span>
    );

    const compact = !!answer || (!wantsChat && (compactSetting || instant));
    const expanded = answer ? (
      <AskIslandAnswer message={answer} />
    ) : compact ? (
      <AskCompact state={state} />
    ) : (
      <AskPanel state={state} />
    );
    const expandedSize = answer
      ? { width: 560, height: answerHeight(answer.text) }
      : compact
        ? { width: 560, height: attachments.length ? 136 : 92 }
        : { width: 560, height: messages ? 340 : attachments.length ? 190 : 150 };

    return {
      // While Gemini answers, it holds a spot in the compact island.
      active: running,
      priority: 60,
      accent: GEMINI_BLUE,
      icon: glyph(16),
      compact: running
        ? {
            left: (
              <>
                {glyph(18)}
                <span className="ask-compact-title">{t("ask.name")}</span>
              </>
            ),
            right: <span className="ask-compact-status">{state?.status ? statusText(t, state.status) : ""}</span>,
            width: 320,
          }
        : undefined,
      expanded,
      expandedSize,
      // The prompt and the answer are a single surface, not a tabbed panel.
      hideTabs: compact,
    };
  },
};

/** Room for the answer pill: header, the wrapped text (at most 7 lines) and the footer. */
function answerHeight(text: string) {
  const lines = text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 60)), 0);
  return 100 + Math.min(Math.max(lines, 2), 7) * 20;
}
