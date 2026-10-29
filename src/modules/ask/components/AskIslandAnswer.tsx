import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { SparkleIcon } from "../../../components/icons";
import { command } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { useIsland } from "../../../core/island";
import { chatRequest, islandAnswer, requestAskInstant, type AskMessage } from "../store";
import { Formatted } from "./Formatted";
import { useAskViewing } from "./useAskViewing";

/**
 * A compact question's answer, unfolded on the island. The island grows with
 * the text; the answer rises out of a blur and a Gemini-blue sheen crosses the
 * surface once.
 */
export function AskIslandAnswer({ message }: { message: AskMessage }) {
  const t = useT();
  const island = useIsland();
  const [copied, setCopied] = useState(false);
  useAskViewing();

  // The reply keeps the keyboard: Enter starts the next message right here.
  useEffect(() => {
    void command("focus_island").catch(() => {});
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      requestAskInstant();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  function copy() {
    navigator.clipboard.writeText(message.text).then(() => setCopied(true));
  }

  function close() {
    islandAnswer.set(null);
    island.collapse();
  }

  function openChat() {
    islandAnswer.set(null);
    chatRequest.set(true);
  }

  return (
    <div className="ask-island-answer" onClick={(e) => e.stopPropagation()}>
      <div className="ask-answer-top">
        <motion.span
          className="ask-logo"
          initial={{ scale: 0.5, rotate: -40, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 340, damping: 18 }}
        >
          <SparkleIcon size={16} />
        </motion.span>
        <span className="ask-title">{t("ask.name")}</span>
        <span className="ask-answer-badge">{t("ask.answerBadge")}</span>
        <span className="ask-spacer" />
        {!message.error && (
          <button className="ask-text-btn" onClick={copy}>
            {copied ? t("ask.copied") : t("ask.copy")}
          </button>
        )}
        <button className="ask-close" title={t("ask.close")} onClick={close}>
          ×
        </button>
      </div>

      <motion.div
        className={`ask-answer-body ${message.error ? "is-error" : ""}`}
        data-scroll
        title={t("ask.answerHint")}
        onClick={(e) => e.shiftKey && openChat()}
        initial={{ opacity: 0, y: 10, filter: "blur(7px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.42, delay: 0.06, ease: [0.22, 0.9, 0.24, 1] }}
      >
        <Formatted text={message.text} />
      </motion.div>

      <motion.div
        className="ask-answer-foot"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.28 }}
      >
        <button className="ask-link" onClick={openChat}>
          {t("ask.openChat")}
        </button>
        <span className="ask-answer-hint">{t("ask.answerHint")}</span>
      </motion.div>
    </div>
  );
}
