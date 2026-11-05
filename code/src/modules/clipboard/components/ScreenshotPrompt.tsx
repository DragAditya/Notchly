import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Glyph } from "../../../components/Glyph";
import { useT } from "../../../core/i18n";
import { useIsland } from "../../../core/island";
import { useSetting } from "../../../core/settings";
import { useNow } from "../../ai-agents/common/format";
import { addToShelf } from "../../shelf/actions";
import {
  cardSeconds,
  dismissedScreenshot,
  formatRemaining,
  remainingMs,
  type PendingScreenshot,
} from "../screenshot";
import { clipboardSettings } from "../settings";
import { clipAction } from "../types";

/**
 * The screenshot card. It fills the notch while it is open, ignores hover,
 * and leaves only two choices: keep the file or delete it now. Doing nothing
 * folds it back into the notch and leaves the file in the Shelf's pending
 * deletion list until its own timer ends.
 */
export function ScreenshotPrompt({ item }: { item: PendingScreenshot }) {
  const t = useT();
  const now = useNow(250);
  const left = remainingMs(item, now);
  const [busy, setBusy] = useState(false);
  const hideSeconds = useSetting(clipboardSettings.screenshotPromptSeconds);
  const seconds = cardSeconds(hideSeconds);
  const { collapse, keepOpen } = useIsland();

  // The card is a prompt, not a panel: hover must not expand, collapse or
  // pause anything while it is visible.
  useEffect(() => {
    keepOpen(true, "screenshot-card");
    return () => keepOpen(false, "screenshot-card");
  }, [keepOpen]);

  // Content swaps for a second screenshot without unmounting the card, so
  // this timer restarts from zero for every new item id.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      dismissedScreenshot.set(item.id);
      collapse();
    }, seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [collapse, item.id, seconds]);

  // Fold the card back first, then let the backend do the work. Waiting for
  // the state round-trip would briefly reveal the clipboard panel instead of
  // morphing straight into the notch.
  const finish = () => {
    dismissedScreenshot.set(item.id);
    collapse();
  };

  const keep = async () => {
    if (busy) return;
    setBusy(true);
    finish();
    try {
      // `keep` cancels the timer and returns the original file for the shelf.
      const paths = await clipAction<string[]>("keep", item.id);
      if (paths?.length) await addToShelf(paths);
    } catch (error) {
      console.error("clipboard: can't keep screenshot", error);
    } finally {
      setBusy(false);
    }
  };

  // Delete is immediate: the original file and its history row both go away.
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    finish();
    try {
      await clipAction("deleteNow", item.id);
    } catch (error) {
      console.error("clipboard: can't delete screenshot", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shot-prompt" data-hit data-no-drag>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={item.id}
          className="shot-layout"
          initial={{ opacity: 0, x: 18, filter: "blur(7px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: -18, filter: "blur(7px)" }}
          transition={{ duration: 0.24, ease: [0.2, 0.9, 0.3, 1] }}
        >
          <div className="shot-preview">
            {item.thumb ? (
              <img src={item.thumb} alt="" draggable={false} />
            ) : (
              <Glyph name="camera" size={30} />
            )}
            <span className="shot-badge">
              <Glyph name="camera" size={11} />
              {t("clipboard.screenshot")}
            </span>
          </div>

          <div className="shot-main">
            <div className="shot-copy">
              <span className="shot-eyebrow">{t("clipboard.cleanup.captured")}</span>
              <span className="shot-title">{t("clipboard.cleanup.keepTitle")}</span>
              <span className="shot-sub">
                {t("clipboard.cleanup.autoDeletesIn", { time: formatRemaining(left) })}
              </span>
            </div>

            <div className="shot-actions">
              <button
                className="shot-delete"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void remove();
                }}
                disabled={busy}
              >
                {t("clipboard.cleanup.delete")}
              </button>
              <button
                className="shot-keep"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void keep();
                }}
                disabled={busy}
              >
                <Glyph name="check" size={14} />
                {t("clipboard.cleanup.keep")}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* The card's own auto-close time, separate from the deletion countdown. */}
      <div className="shot-progress" aria-hidden>
        <span key={item.id} style={{ animationDuration: `${seconds}s` }} />
      </div>
    </div>
  );
}
