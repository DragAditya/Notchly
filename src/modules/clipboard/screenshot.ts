import { createStore } from "../../core/island";
import type { ClipItem } from "./types";

/** A screenshot that is still waiting for Keep/Delete. */
export type PendingScreenshot = ClipItem & { deleteAt: number; kept: false };

/** Screenshot ids whose prompt has already auto-hidden. */
export const dismissedScreenshot = createStore<number | null>(null);

export function isPendingScreenshot(item: ClipItem | undefined): item is PendingScreenshot {
  return !!item && item.screenshot && item.deleteAt != null && !item.kept;
}

/** Time left before the original file is deleted. */
export function remainingMs(item: Pick<PendingScreenshot, "deleteAt">, now: number) {
  return Math.max(0, item.deleteAt - now);
}

/** The full delay, used to draw a deletion progress bar. */
export function remainingFraction(
  item: Pick<PendingScreenshot, "deleteAt" | "copiedAt">,
  now: number,
) {
  const total = Math.max(1, item.deleteAt - item.copiedAt);
  return Math.min(1, Math.max(0, remainingMs(item, now) / total));
}

/** The configured lifetime of the big card, clamped to the settings range. */
export function cardSeconds(value: unknown) {
  const seconds = Math.round(Number(value) || 4);
  return Math.min(60, Math.max(1, seconds));
}

/** m:ss, or h:mm:ss for long delays. */
export function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
