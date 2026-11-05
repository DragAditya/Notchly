import type { SettingDef } from "../../core/settings";

export type ShelfDropBehavior = "link" | "copy" | "move";

export const shelfSettings = {
  maxItems: {
    key: "shelf.maxItems",
    label: "shelf.settings.maxItems.label",
    description: "shelf.settings.maxItems.desc",
    default: 12,
  } satisfies SettingDef<number>,
  autoClearMinutes: {
    key: "shelf.autoClearMinutes",
    label: "shelf.settings.autoClear.label",
    description: "shelf.settings.autoClear.desc",
    default: 0,
  } satisfies SettingDef<number>,
  dropBehavior: {
    key: "shelf.dropBehavior",
    label: "shelf.settings.drop.label",
    description: "shelf.settings.drop.desc",
    default: "link",
  } as SettingDef<ShelfDropBehavior>,
} satisfies Record<string, SettingDef<any>>;
