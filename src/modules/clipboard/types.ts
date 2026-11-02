import { providerAction } from "../../core/bridge";

/** Mirrors `ItemView` in `src-tauri/src/providers/clipboard/mod.rs`. */
export interface ClipItem {
  id: number;
  kind: "text" | "image" | "files";
  /** Text: its start, on one line. */
  preview: string | null;
  chars: number | null;
  /** Pictures: small PNG data URL, full size and the saved file. */
  thumb: string | null;
  width: number | null;
  height: number | null;
  path: string | null;
  /** Files: their names. */
  names: string[];
  screenshot: boolean;
  /** Screenshots: when the original will be deleted (ms), if not kept. */
  deleteAt: number | null;
  /** Screenshots: the user kept it; no auto-delete. */
  kept: boolean;
  /** App that copied it. */
  source: string | null;
  copiedAt: number;
  /** Copied again from the island: no "copied" pill. */
  quiet: boolean;
}

/** A screenshot waiting for Keep/Delete, also available after a restart. */
export interface PendingScreenshotView {
  path: string;
  name: string;
  copiedAt: number;
  deleteAt: number;
  thumb: string | null;
}

export interface ClipboardState {
  items: ClipItem[];
  pending: PendingScreenshotView[];
}

export const CLIPBOARD_PROVIDER = "clipboard";
export const CLIPBOARD_YELLOW = "#FFD60A";

export const clipAction = <T = unknown>(
  action: "copy" | "paste" | "remove" | "deleteNow" | "drag" | "open" | "keep" | "keepScreenshot" | "text",
  id: number,
) => providerAction<T>(CLIPBOARD_PROVIDER, action, id);

export const clipPendingAction = <T = unknown>(
  action: "keepPending" | "deletePending",
  path: string,
) => providerAction<T>(CLIPBOARD_PROVIDER, action, path);
