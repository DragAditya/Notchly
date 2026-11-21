/**
 * The tiny pop-out affordance that lives on the companion face in the mini
 * notch (and on the idle face). Only the face itself is clickable; hovering it
 * reveals a small expand glyph. Clicks never reach the shell, so the island
 * doesn't expand instead.
 */
import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { useT } from "../core/i18n";
import { openLyricsFrom } from "./useLyricsPanel";
import "./lyrics.css";

export function LyricsTrigger({ children, className = "" }: { children: ReactNode; className?: string }) {
  const t = useT();
  const stop = (e: PointerEvent | MouseEvent) => {
    e.stopPropagation();
  };
  return (
    <button
      type="button"
      className={`lyrics-pop ${className}`}
      title={t("music.board.open")}
      aria-label={t("music.board.open")}
      onPointerDown={stop}
      onClick={(e) => {
        stop(e);
        e.preventDefault();
        openLyricsFrom(e.currentTarget);
      }}
    >
      {children}
      <span className="lyrics-pop-hint" aria-hidden="true">
        ⤢
      </span>
    </button>
  );
}
