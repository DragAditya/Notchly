import type { SettingDef } from "../../core/settings";

export const musicSettings = {
  autoExpand: {
    key: "music.autoExpand.label",
    label: "music.autoExpand.label",
    description: "music.autoExpand.desc",
    default: false,
  },
  visualizer: {
    key: "music.visualizer.label",
    label: "music.visualizer.label",
    description: "music.visualizer.desc",
    default: true,
  },
  // Read by the backend too (`smtc.rs`): off means no YouTube lookups at all.
  video: {
    key: "music.video.label",
    label: "music.video.label",
    description: "music.video.desc",
    default: false,
  },
} satisfies Record<string, SettingDef>;

export type LyricsMode = "line" | "word";

/**
 * Live lyrics (LRCLIB). Kept out of `musicSettings` because these are not all
 * boolean toggles: the module page draws them with `LyricsSettings`.
 */
export const lyricsSettings = {
  enabled: {
    key: "music.lyrics.enabled",
    label: "music.lyrics.label",
    description: "music.lyrics.desc",
    default: true,
  } satisfies SettingDef,
  mode: {
    key: "music.lyrics.mode",
    label: "music.lyrics.modeLabel",
    default: "line" as LyricsMode,
  } satisfies SettingDef<LyricsMode>,
  offset: {
    key: "music.lyrics.offset",
    label: "music.lyrics.offsetLabel",
    default: 0,
  } satisfies SettingDef<number>,
};
