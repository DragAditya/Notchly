import { Glyph } from "../../../components/Glyph";
import { useT } from "../../../core/i18n";
import { pendingAttachments } from "../store";

/** Pending screenshots/files above the question box (shared by both Ask surfaces). */
export function AttachmentChips() {
  const t = useT();
  const attachments = pendingAttachments.use();
  if (!attachments.length) return null;
  return (
    <div className="ask-chips">
      {attachments.map((a) => (
        <span key={a.path} className="ask-chip" title={a.path}>
          {a.thumb ? <img src={a.thumb} alt="" /> : <Glyph name="folder" size={13} />}
          <span className="ask-chip-name">{a.label ?? a.name}</span>
          <button
            title={t("ask.remove")}
            onClick={() => pendingAttachments.set((prev) => prev.filter((p) => p.path !== a.path))}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
