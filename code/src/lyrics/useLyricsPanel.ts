/** Frontend bridge for the floating lyrics window (`src-tauri/src/lyrics_board.rs`). */
import { useEffect, useState } from "react";
import { command, useTauriEvent } from "../core/bridge";

export const LYRICS_CHANGED = "lyrics://changed";
export const LYRICS_CLOSING = "lyrics://closing";
export const LYRICS_CLOSED = "lyrics://closed";

/** The notch rect, in island-window CSS pixels, the board grows out of. */
export function openLyricsFrom(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  void command("open_lyrics", {
    origin: { x: r.left, y: r.top, width: r.width, height: r.height },
  });
}

export const closeLyrics = () => void command("close_lyrics");

/** True while the board window is alive (hidden counts as alive). */
export function useLyricsOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void command<boolean>("is_lyrics_open").then((v) => setOpen(!!v));
  }, []);
  useTauriEvent<boolean>(LYRICS_CHANGED, (v) => setOpen(!!v));
  return open;
}
