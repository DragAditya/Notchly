/**
 * Settings store shared by every window.
 *
 * Values live in the backend (`src-tauri/src/settings.rs`) as a flat key/value
 * map; the schema lives here in the frontend: each setting is a `SettingDef`
 * declared next to the code that uses it (core or a module), carrying its own
 * default. Outside Tauri, values fall back to localStorage.
 */
import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { command, isTauri } from "./bridge";
import type { MessageKey } from "./i18n";
import type { IslandModule } from "./types";

export interface SettingDef<T = boolean> {
  key: string;
  /** Translation keys (see `src/locales`). */
  label: MessageKey;
  description?: MessageKey;
  default: T;
}

export type Values = Record<string, unknown>;

let values: Values = {};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const LOCAL_KEY = "island-settings";

let started = false;
export async function startSettings() {
  if (started) return;
  started = true;
  if (!isTauri) {
    try {
      values = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}");
    } catch {
      values = {};
    }
    // Browser preview: `?mode=eyes` / `?mode=activities` / `?mode=off` lets
    // the compact surfaces be reviewed without opening the settings window.
    const previewMode = new URLSearchParams(location.search).get("mode");
    if (previewMode) values = { ...values, "companion.mode": previewMode };
    notify();
    return;
  }
  await listen<Values>("settings://changed", (e) => {
    values = e.payload;
    notify();
  });
  values = (await command<Values>("get_settings")) ?? {};
  notify();
}

export function readSetting<T>(all: Values, def: SettingDef<T>): T {
  return (def.key in all ? all[def.key] : def.default) as T;
}

/** Whole settings map (re-renders on any change). */
export function useSettings(): Values {
  return useSyncExternalStore(subscribe, () => values);
}

export function useSetting<T>(def: SettingDef<T>): T {
  return readSetting(useSettings(), def);
}

export function setSetting<T>(def: SettingDef<T> | string, value: T) {
  const key = typeof def === "string" ? def : def.key;
  values = { ...values, [key]: value }; // optimistic
  notify();
  if (isTauri) {
    command("set_setting", { key, value });
  } else {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(values));
    } catch {
      /* preview only */
    }
  }
}

/** Every module gets an on/off switch. */
export const moduleEnabled = ({ id, title, enabledByDefault = true }: Pick<IslandModule, "id" | "title" | "enabledByDefault">): SettingDef => ({
  key: `module.${id}.enabled`,
  label: title,
  default: enabledByDefault,
});

export type HoverAction = "expand" | "companion" | "none";

export const generalSettings = {
  hideInFullscreen: {
    key: "island.hideInFullscreen",
    label: "settings.hideInFullscreen.label",
    description: "settings.hideInFullscreen.desc",
    default: true,
  },
  expandOnHover: {
    key: "island.expandOnHover",
    label: "settings.expandOnHover.label",
    description: "settings.expandOnHover.desc",
    default: true,
  },
  hoverDelay: {
    key: "island.hoverDelay",
    label: "settings.hoverDelay.label",
    description: "settings.hoverDelay.desc",
    default: 110,
  } satisfies SettingDef<number>,
  hoverAction: {
    key: "island.hoverAction",
    label: "settings.hoverAction.label",
    description: "settings.hoverAction.desc",
    default: "expand",
  } as SettingDef<HoverAction>,
} satisfies Record<string, SettingDef<any>>;

/** Global shortcuts, edited from Advanced. The instant prompt lives in Ask's own settings. */
export const shortcutSettings = {
  ask: {
    key: "shortcuts.ask",
    label: "shortcuts.ask.label",
    description: "shortcuts.ask.desc",
    default: "Ctrl+Alt+Space",
  } satisfies SettingDef<string>,
  find: {
    key: "shortcuts.find",
    label: "shortcuts.find.label",
    description: "shortcuts.find.desc",
    default: "Ctrl+Alt+F",
  } satisfies SettingDef<string>,
  companionSummon: {
    key: "shortcuts.companionSummon",
    label: "shortcuts.companionSummon.label",
    description: "shortcuts.companionSummon.desc",
    default: "Ctrl+Alt+R",
  } satisfies SettingDef<string>,
  companionToggle: {
    key: "shortcuts.companionToggle",
    label: "shortcuts.companionToggle.label",
    description: "shortcuts.companionToggle.desc",
    default: "Ctrl+Alt+Shift+R",
  } satisfies SettingDef<string>,
} satisfies Record<string, SettingDef<any>>;

/** Restore a group of settings to the defaults declared next to their code. */
export function resetSettings(defs: SettingDef<any>[]) {
  for (const def of defs) setSetting(def, def.default);
}

/**
 * How the companion shares the compact island with live activities.
 *
 * - `off`: no eyes or companion reactions; live activities keep their cards.
 * - `eyes`: eyes lead the compact surfaces, with text and extra detail reduced.
 * - `activities`: normal live-activity cards, no eyes.
 * - `mixed`: eyes plus the full activity detail (the default).
 */
export type CompanionMode = "off" | "eyes" | "activities" | "mixed";
export type CompanionIntensity = "calm" | "balanced" | "energetic";
export type CompanionDance = "auto" | "groove" | "bounce" | "shimmy" | "wave" | "spin" | "hop";

/** Old installs stored `auto` / `always`; both mean the full mixed presentation. */
export function companionModeOf(value: unknown): CompanionMode {
  if (value === "off" || value === "eyes" || value === "activities" || value === "mixed") return value;
  return "mixed";
}

export const companionSettings = {
  eyeColor: {
    key: "companion.eyeColor",
    label: "companion.eyeColor.label",
    description: "companion.eyeColor.desc",
    default: "",
  } satisfies SettingDef<string>,
  blinkRate: {
    key: "companion.blinkRate",
    label: "companion.blinkRate.label",
    description: "companion.blinkRate.desc",
    default: 7.2,
  } satisfies SettingDef<number>,
  gazeFollow: {
    key: "companion.gazeFollow",
    label: "companion.gaze.label",
    description: "companion.gaze.desc",
    default: true,
  } satisfies SettingDef,
  mode: {
    key: "companion.mode",
    label: "companion.mode.label",
    description: "companion.mode.desc",
    default: "mixed",
  } as SettingDef<CompanionMode>,
  resting: {
    key: "companion.resting",
    label: "companion.resting.label",
    description: "companion.resting.desc",
    default: true,
  } satisfies SettingDef,
  intensity: {
    key: "companion.intensity",
    label: "companion.intensity.label",
    description: "companion.intensity.desc",
    default: "balanced",
  } as SettingDef<CompanionIntensity>,
  speed: {
    key: "companion.speed",
    label: "companion.speed.label",
    description: "companion.speed.desc",
    default: 1,
  } satisfies SettingDef<number>,
  glow: {
    key: "companion.glow",
    label: "companion.glow.label",
    description: "companion.glow.desc",
    default: true,
  } satisfies SettingDef,
  reduceMotion: {
    key: "companion.reduceMotion",
    label: "companion.reduceMotion.label",
    description: "companion.reduceMotion.desc",
    default: false,
  } satisfies SettingDef,
  effectVolume: {
    key: "companion.effect.volume",
    label: "companion.effect.volume",
    default: true,
  } satisfies SettingDef,
  effectBrightness: {
    key: "companion.effect.brightness",
    label: "companion.effect.brightness",
    default: true,
  } satisfies SettingDef,
  effectCharging: {
    key: "companion.effect.charging",
    label: "companion.effect.charging",
    default: true,
  } satisfies SettingDef,
  effectBattery: {
    key: "companion.effect.battery",
    label: "companion.effect.battery",
    default: true,
  } satisfies SettingDef,
  effectBluetooth: {
    key: "companion.effect.bluetooth",
    label: "companion.effect.bluetooth",
    default: true,
  } satisfies SettingDef,
  effectWifi: {
    key: "companion.effect.wifi",
    label: "companion.effect.wifi",
    default: true,
  } satisfies SettingDef,
  effectNotifications: {
    key: "companion.effect.notifications",
    label: "companion.effect.notifications",
    default: true,
  } satisfies SettingDef,
  musicEyes: {
    key: "companion.music.eyes",
    label: "companion.music.eyes.label",
    description: "companion.music.eyes.desc",
    default: true,
  } satisfies SettingDef,
  dance: {
    key: "companion.music.dance",
    label: "companion.music.dance.label",
    description: "companion.music.dance.desc",
    default: "auto",
  } as SettingDef<CompanionDance>,
};

/** Normalized mode, including old `auto` / `always` values. */
export function useCompanionMode(): CompanionMode {
  return companionModeOf(useSetting(companionSettings.mode));
}

/**
 * Tabs of the open island: their order, and which ones sit in the tab bar.
 * Every enabled module is also in the launcher (the grid button), so the bar
 * can stay short however many modules there are.
 */
export const layoutSettings = {
  /** Module ids in tab order; modules missing from it follow in registry order. */
  order: {
    key: "island.order",
    label: "modules.title",
    default: [],
  } satisfies SettingDef<string[]>,
  /** Module ids shown in the tab bar (a busy module shows up there anyway). */
  pinned: {
    key: "island.pinned",
    label: "layout.pinned",
    default: ["music", "ai-agents", "ask", "notifications", "clipboard", "monitor", "clock"],
  } satisfies SettingDef<string[]>,
  /** Module ids kept in the tab bar even when they have nothing to show (e.g. an empty shelf). */
  pinnedAlways: {
    key: "island.pinnedAlways",
    label: "layout.pinned",
    default: [] as string[],
  } satisfies SettingDef<string[]>,
};

/** Where a module's tab goes: the launcher only, the tab bar, or the tab bar even when empty. */
export type Placement = "launcher" | "bar" | "always";

export function placementOf(values: Record<string, unknown>, id: string): Placement {
  if (readSetting(values, layoutSettings.pinnedAlways).includes(id)) return "always";
  return readSetting(values, layoutSettings.pinned).includes(id) ? "bar" : "launcher";
}

export function setPlacement(values: Record<string, unknown>, id: string, placement: Placement) {
  const without = (list: string[]) => list.filter((p) => p !== id);
  const pinned = without(readSetting(values, layoutSettings.pinned));
  const always = without(readSetting(values, layoutSettings.pinnedAlways));
  setSetting(layoutSettings.pinned, placement === "bar" ? [...pinned, id] : pinned);
  setSetting(layoutSettings.pinnedAlways, placement === "always" ? [...always, id] : always);
}

/** `items` sorted by the saved order; unknown ones keep their place at the end. */
export function inOrder<T>(items: T[], idOf: (item: T) => string, order: string[]): T[] {
  const rank = (item: T) => {
    const i = order.indexOf(idOf(item));
    return i === -1 ? order.length + items.indexOf(item) : i;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/** Where the island goes after being dragged along the top edge. */
export const positionSettings = {
  returnToCenter: {
    key: "island.returnToCenter",
    label: "settings.returnToCenter.label",
    description: "settings.returnToCenter.desc",
    default: true,
  } satisfies SettingDef,
  returnDelay: {
    key: "island.returnDelay",
    label: "settings.returnDelay.label",
    description: "settings.returnDelay.desc",
    default: 5,
  } satisfies SettingDef<number>,
};

/**
 * Which monitor the island lives on (applied by the backend, `display.rs`).
 * `monitor` is "primary" (follows Windows' primary monitor) or a monitor id
 * from the `list_monitors` command.
 */
export const monitorSettings = {
  monitor: {
    key: "island.monitor",
    label: "settings.monitor.label",
    description: "settings.monitor.desc",
    default: "primary",
  } satisfies SettingDef<string>,
  avoidMaximized: {
    key: "island.avoidMaximized",
    label: "settings.avoidMaximized.label",
    description: "settings.avoidMaximized.desc",
    default: false,
  } satisfies SettingDef,
};

/** Last drag offset from the center in CSS px (kept only when not returning). */
export const ISLAND_OFFSET_KEY = "island.offset";

/** Swallowed by the tray's black hole; written by the backend (`tray.rs`). */
export const ISLAND_HIDDEN_KEY = "island.hidden";

/**
 * Look of the island:
 * - `dynamic`: hangs from the top edge with concave "ears", like the notch.
 * - `windows`: a floating pill with rounded corners, a tab bar at the bottom,
 *   a clock at rest and an optional gradient rim (Windows Island's look).
 */
export type IslandStyle = "dynamic" | "windows";
export type CompactDensity = "compact" | "cozy" | "roomy";
export type IdleClockFormat = "time" | "date" | "both";

export const appearanceSettings = {
  /** Blur radius in px behind the island; 0 keeps it fully opaque. */
  backgroundBlur: {
    key: "appearance.backgroundBlur",
    label: "appearance.blur.label",
    description: "appearance.blur.desc",
    default: 0,
  } satisfies SettingDef<number>,
  /** 0 keeps the radius that belongs to the selected style. */
  cornerRadius: {
    key: "appearance.cornerRadius",
    label: "appearance.radius.label",
    description: "appearance.radius.desc",
    default: 0,
  } satisfies SettingDef<number>,
  scale: {
    key: "appearance.scale",
    label: "appearance.scale.label",
    description: "appearance.scale.desc",
    default: 1,
  } satisfies SettingDef<number>,
  density: {
    key: "appearance.density",
    label: "appearance.density.label",
    description: "appearance.density.desc",
    default: "cozy",
  } as SettingDef<CompactDensity>,
  animationSpeed: {
    key: "appearance.animationSpeed",
    label: "appearance.animationSpeed.label",
    description: "appearance.animationSpeed.desc",
    default: 1,
  } satisfies SettingDef<number>,
  /** Seconds for one lap of the animated rim. */
  borderSpeed: {
    key: "appearance.borderSpeed",
    label: "appearance.borderSpeed.label",
    description: "appearance.borderSpeed.desc",
    default: 7,
  } satisfies SettingDef<number>,
  idleClockFormat: {
    key: "appearance.idleClockFormat",
    label: "appearance.clockFormat.label",
    description: "appearance.clockFormat.desc",
    default: "time",
  } as SettingDef<IdleClockFormat>,
  style: {
    key: "appearance.style",
    label: "appearance.style.label",
    description: "appearance.style.desc",
    default: "dynamic",
  } as SettingDef<IslandStyle>,
  /** A preset id from `core/appearance.ts`, "none" (classic hairline) or "custom". */
  border: {
    key: "appearance.border",
    label: "appearance.border.label",
    description: "appearance.border.desc",
    default: "none",
  } satisfies SettingDef<string>,
  customColors: {
    key: "appearance.customColors",
    label: "appearance.custom.label",
    default: ["#BF5AF2", "#64D2FF"],
  } satisfies SettingDef<string[]>,
  thickness: {
    key: "appearance.borderThickness",
    label: "appearance.thickness.label",
    default: 2,
  } satisfies SettingDef<number>,
  animate: {
    key: "appearance.animateBorder",
    label: "appearance.animate.label",
    description: "appearance.animate.desc",
    default: false,
  } satisfies SettingDef,
  glow: {
    key: "appearance.glow",
    label: "appearance.glow.label",
    description: "appearance.glow.desc",
    default: true,
  } satisfies SettingDef,
  idleClock: {
    key: "appearance.idleClock",
    label: "appearance.idleClock.label",
    description: "appearance.idleClock.desc",
    default: true,
  } satisfies SettingDef,
};
