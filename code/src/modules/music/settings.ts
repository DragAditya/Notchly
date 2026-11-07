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
  showArtwork: {
    key: "music.showArtwork",
    label: "music.showArtwork.label",
    description: "music.showArtwork.desc",
    default: true,
  },
  showProgress: {
    key: "music.showProgress",
    label: "music.showProgress.label",
    description: "music.showProgress.desc",
    default: true,
  },
  hideWhenPaused: {
    key: "music.hideWhenPaused",
    label: "music.hideWhenPaused.label",
    description: "music.hideWhenPaused.desc",
    default: false,
  },
} satisfies Record<string, SettingDef>;

export type MusicSource = "system" | "spotify" | "browser";

/** Which player wins when several apps expose a media session. */
export const musicSourceSettings = {
  sourcePriority: {
    key: "music.sourcePriority",
    label: "music.source.label",
    description: "music.source.desc",
    default: "system",
  } as SettingDef<MusicSource>,
};

export type LyricsMode = "line" | "word";

/**
 * Live lyrics (LRCLIB + lyrics.ovh). Kept out of `musicSettings` because these
 * are not all boolean toggles: the module page draws them with `LyricsSettings`.
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
