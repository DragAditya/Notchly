/**
 * Clipboard — what you copy shows up in the island for a moment, screenshots
 * open it with the picture, and the latest items stay listed to copy again,
 * drag out, keep on the shelf or ask Claude about.
 * Backend: `src-tauri/src/providers/clipboard/`.
 */
import { Glyph } from "../../components/Glyph";
import { useProvider } from "../../core/bridge";
import { useSetting } from "../../core/settings";
import type { IslandModule, ModuleView } from "../../core/types";
import { useNow } from "../ai-agents/common/format";
import { ClipboardCompactLeft, ClipboardCompactRight } from "./components/ClipboardCompact";
import { ClipboardPanel } from "./components/ClipboardPanel";
import { ClipboardSettings } from "./components/ClipboardSettings";
import { ScreenshotPrompt } from "./components/ScreenshotPrompt";
import { dismissedScreenshot, isPendingScreenshot } from "./screenshot";
import { clipboardSettings, SCREENSHOT_CARD_SIZES } from "./settings";
import { CLIPBOARD_PROVIDER, CLIPBOARD_YELLOW, type ClipboardState } from "./types";
import "./clipboard.css";

/** The "copied" pill stays this long. */
const FLASH_MS = 3000;
/** A fresh picture is shown big in the panel for this long. */
const HERO_MS = 20_000;
const ROW = 48;
const MAX_ROWS = 4;

export const clipboardModule: IslandModule = {
  id: "clipboard",
  title: "clipboard.title",
  settingsIcon: <Glyph name="clipboard" size={14} />,
  settings: [
    clipboardSettings.showOnCopy,
    clipboardSettings.peekOnScreenshot,
    clipboardSettings.screenshotCleanup,
  ],
  SettingsSection: ClipboardSettings,
  useView(): ModuleView {
    const state = useProvider<ClipboardState>(CLIPBOARD_PROVIDER);
    const showOnCopy = useSetting(clipboardSettings.showOnCopy);
    const peekOnScreenshot = useSetting(clipboardSettings.peekOnScreenshot);
    const imagePreview = useSetting(clipboardSettings.imagePreview);
    const cardSize = useSetting(clipboardSettings.screenshotCardSize);
    const items = state?.items ?? [];
    const latest = items[0];
    // A screenshot waiting for Keep/Delete gets its own card.
    const shot = isPendingScreenshot(latest) ? latest : undefined;
    const dismissed = dismissedScreenshot.use();
    // The big card is pinned open by `forceExpanded`; it is closed by its own
    // timer, Keep, or Delete, never by hover.
    const visibleShot = peekOnScreenshot && shot && dismissed !== shot.id ? shot : undefined;
    const card = SCREENSHOT_CARD_SIZES[cardSize] ?? SCREENSHOT_CARD_SIZES.balanced;
    const fresh = !!latest && !latest.quiet && Date.now() - latest.copiedAt < HERO_MS;
    // Re-render while something is fresh, so the pill and the hero go away on time.
    const now = useNow(500, fresh);
    const age = latest ? now - latest.copiedAt : Infinity;

    // Screenshots never fall back to a compact pill: after the card folds
    // away the pending Shelf owns them.
    const flashing = !shot && showOnCopy && !!latest && !latest.screenshot && !latest.quiet && age < FLASH_MS;
    const hero = !shot && !!latest && latest.kind === "image" && imagePreview && !latest.quiet && age < HERO_MS;
    const listed = hero ? items.length - 1 : items.length;
    const rows = hero ? Math.min(listed, 1) : Math.min(Math.max(listed, 1), MAX_ROWS);

    return {
      active: !!visibleShot || flashing,
      // A 3 s flash: above music and a working/finished agent, under an agent
      // waiting for permission and the system alerts (volume…).
      priority: shot ? 100 : 75,
      hidden: items.length === 0,
      accent: CLIPBOARD_YELLOW,
      icon: <Glyph name="clipboard" size={14} color={CLIPBOARD_YELLOW} />,
      // Once a screenshot is pending, never fall back to the small clipboard
      // pill for it: the Shelf owns it after the card folds away.
      compact:
        !shot && latest
          ? {
              left: <ClipboardCompactLeft item={latest} />,
              right: <ClipboardCompactRight />,
              width: 340,
            }
          : undefined,
      expanded: visibleShot ? <ScreenshotPrompt item={visibleShot} /> : <ClipboardPanel state={state} hero={hero} />,
      expandedSize: visibleShot ? card : { width: 560, height: 46 + (hero ? 124 : 0) + rows * ROW },
      // The prompt is a one-shot card, not the history: no tabs. It stays
      // pinned while open, then morphs back into the notch.
      hideTabs: !!visibleShot,
      forceExpanded: !!visibleShot,
    };
  },
};
