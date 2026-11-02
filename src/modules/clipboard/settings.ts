import type { SettingDef } from "../../core/settings";

export type ClipboardPasteBehavior = "copy" | "paste";
export type ScreenshotCardSize = "compact" | "balanced" | "large";

export const SCREENSHOT_CARD_SIZES: Record<ScreenshotCardSize, { width: number; height: number }> = {
  compact: { width: 480, height: 150 },
  balanced: { width: 540, height: 165 },
  large: { width: 600, height: 185 },
};

export const clipboardSettings = {
  showOnCopy: {
    key: "clipboard.showOnCopy",
    label: "clipboard.showOnCopy.label",
    description: "clipboard.showOnCopy.desc",
    default: true,
  },
  peekOnScreenshot: {
    key: "clipboard.peekOnScreenshot",
    label: "clipboard.peekOnScreenshot.label",
    description: "clipboard.peekOnScreenshot.desc",
    default: true,
  },
  screenshotCleanup: {
    key: "clipboard.screenshotCleanup",
    label: "clipboard.screenshotCleanup.label",
    description: "clipboard.screenshotCleanup.desc",
    default: true,
  },
  screenshotTtlMinutes: {
    key: "clipboard.screenshotTtlMinutes",
    label: "clipboard.screenshotTtl.label",
    description: "clipboard.screenshotTtl.desc",
    default: 5,
  } satisfies SettingDef<number>,
  screenshotPromptSeconds: {
    key: "clipboard.screenshotPromptSeconds",
    label: "clipboard.screenshotPrompt.label",
    description: "clipboard.screenshotPrompt.desc",
    default: 4,
  } satisfies SettingDef<number>,
  screenshotCardSize: {
    key: "clipboard.screenshotCardSize",
    label: "clipboard.screenshotCardSize.label",
    description: "clipboard.screenshotCardSize.desc",
    default: "balanced",
  } as SettingDef<ScreenshotCardSize>,
  imagePreview: {
    key: "clipboard.imagePreview",
    label: "clipboard.imagePreview.label",
    description: "clipboard.imagePreview.desc",
    default: true,
  },
  retentionMinutes: {
    key: "clipboard.retentionMinutes",
    label: "clipboard.retention.label",
    description: "clipboard.retention.desc",
    default: 0,
  } satisfies SettingDef<number>,
  pasteBehavior: {
    key: "clipboard.pasteBehavior",
    label: "clipboard.paste.label",
    description: "clipboard.paste.desc",
    default: "copy",
  } as SettingDef<ClipboardPasteBehavior>,
} satisfies Record<string, SettingDef<any>>;
