/**
 * Shelf — like the notch apps on the Mac: drag files or folders onto the
 * island and it keeps them for a moment (by reference, nothing is copied).
 * Drag them out to any app, double-click to open, or ask Claude about them.
 * Backend: `src-tauri/src/providers/shelf.rs`.
 */
import { Glyph } from "../../components/Glyph";
import { useProvider } from "../../core/bridge";
import { draggingFiles } from "../../core/island";
import type { IslandModule, ModuleView } from "../../core/types";
import { CLIPBOARD_PROVIDER, type ClipboardState } from "../clipboard/types";
import { SHELF_PROVIDER, type ShelfState } from "./actions";
import { ShelfPanel } from "./components/ShelfPanel";
import { ShelfSettings } from "./components/ShelfSettings";
import "./shelf.css";

const SHELF_BLUE = "#64D2FF";
const PER_ROW = 5;
const ROW = 100;
const PENDING_ROW = 64;
const PENDING_HEAD = 32;
const MAX_PENDING_ROWS = 3;

export const shelfModule: IslandModule = {
  id: "shelf",
  title: "shelf.title",
  settingsIcon: <Glyph name="folder" size={14} />,
  SettingsSection: ShelfSettings,
  useView(): ModuleView {
    const state = useProvider<ShelfState>(SHELF_PROVIDER);
    const clipboard = useProvider<ClipboardState>(CLIPBOARD_PROVIDER);
    const dragging = draggingFiles.use();
    const count = state?.items.length ?? 0;
    const pending = clipboard?.pending ?? [];
    const pendingCount = pending.length;
    const rows = Math.min(2, Math.max(1, Math.ceil(count / PER_ROW)));
    const pendingRows = Math.min(MAX_PENDING_ROWS, pendingCount);
    // The normal shelf keeps its existing 100 px rows. Pending shots are
    // shorter full-width rows, capped to three visible with their own scroll.
    const base = count > 0 || pendingCount === 0 ? 54 : 32;
    const normalHeight = count > 0 ? rows * ROW : pendingCount > 0 ? 0 : ROW;
    const pendingHeight = pendingCount > 0 ? PENDING_HEAD + pendingRows * PENDING_ROW : 0;

    return {
      active: false,
      priority: 0,
      // Shows up once it holds something, has pending screenshots, or while
      // files are dragged over the island.
      hidden: count === 0 && pendingCount === 0 && !dragging,
      accent: SHELF_BLUE,
      icon: <Glyph name="folder" size={14} color={SHELF_BLUE} />,
      expanded: <ShelfPanel state={state} pending={pending} />,
      expandedSize: { width: 560, height: base + normalHeight + pendingHeight },
    };
  },
};
