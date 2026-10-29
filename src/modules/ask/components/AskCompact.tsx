import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Glyph } from "../../../components/Glyph";
import { SparkleIcon } from "../../../components/icons";
import { command, providerAction } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { useIsland } from "../../../core/island";
import {
  addAttachments,
  ASK_PROVIDER,
  chatRequest,
  compactWaiting,
  draftRequest,
  focusRequest,
  GEMINI_BLUE,
  pendingAttachments,
  type AskState,
  type Attachment,
} from "../store";
import { AttachmentChips } from "./AttachmentChips";
import { useAskViewing } from "./useAskViewing";

/**
 * Compact Ask: a single prompt line. Sending it collapses the island while
 * Gemini thinks; the reply opens on the island's answer surface.
 */
export function AskCompact({ state }: { state: AskState | undefined }) {
  const t = useT();
  const island = useIsland();
  const attachments = pendingAttachments.use();
  const focusPending = focusRequest.use();
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  /** The question left the field: keep the reply surface armed on unmount. */
  const sent = useRef(false);
  useAskViewing();

  // The shortcut asked for the keyboard: take it (the island is already open).
  useEffect(() => {
    if (!focusPending) return;
    focusRequest.set(false);
    takeKeyboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPending]);

  // Text handed over from a clipboard/shelf "ask about this" action.
  const draftPending = draftRequest.use();
  useEffect(() => {
    const text = draftRequest.get();
    if (text == null) return;
    draftRequest.set(null);
    setDraft((prev) => `${prev.trim() ? `${prev.trimEnd()}\n\n` : ""}${text}\n\n`);
    takeKeyboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPending]);

  // The field grows a little with the question (two lines fit the compact pill).
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 42)}px`;
  }, [draft]);

  // Closed without asking: nothing is on its way.
  useEffect(
    () => () => {
      if (!sent.current) compactWaiting.set(null);
    },
    [],
  );

  function takeKeyboard() {
    island.keepOpen(true, "ask-compact");
    command("focus_island");
    window.setTimeout(() => input.current?.focus(), 30);
  }

  function close() {
    compactWaiting.set(null);
    island.keepOpen(false, "ask-compact");
    island.collapse();
    command("restore_focus");
  }

  function send() {
    if (!draft.trim() && !attachments.length) return;
    sent.current = true;
    // The backend appends the question and an empty reply before Gemini starts.
    compactWaiting.set((state?.messages.length ?? 0) + 2);
    providerAction(ASK_PROVIDER, "send", { text: draft, attachments, compact: true });
    setDraft("");
    pendingAttachments.set([]);
    input.current?.blur();
    // Out of the way while it thinks; the answer opens the island again.
    island.keepOpen(false, "ask-compact");
    island.collapse();
    command("restore_focus");
  }

  function openChat() {
    if (draft.trim()) draftRequest.set(draft);
    chatRequest.set(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  async function screenshot() {
    const shot = await providerAction<Attachment>(ASK_PROVIDER, "screenshot").catch(() => undefined);
    if (shot) addAttachments([shot]);
    takeKeyboard();
  }

  return (
    <div className="ask-compact" onClick={(e) => e.stopPropagation()}>
      <AttachmentChips />
      <div className="ask-compact-field">
        <span className="ask-compact-spark" aria-hidden>
          <SparkleIcon size={17} />
        </span>
        <textarea
          ref={input}
          rows={1}
          value={draft}
          placeholder={t("ask.placeholder")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onMouseDown={takeKeyboard}
          onFocus={() => island.keepOpen(true, "ask-compact")}
          onBlur={() => island.keepOpen(false, "ask-compact")}
        />
        <button className="ask-icon-btn" title={t("ask.openChat")} onClick={openChat}>
          <Glyph name="chat" size={14} />
        </button>
        <button className="ask-icon-btn" title={t("ask.screenshot")} onClick={screenshot}>
          <Glyph name="camera" size={14} />
        </button>
        <button
          className="ask-send"
          style={{ background: GEMINI_BLUE }}
          title={t("ask.send")}
          disabled={!draft.trim() && !attachments.length}
          onClick={send}
        >
          <Glyph name="upload" size={13} />
        </button>
      </div>
    </div>
  );
}
