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
  // Read by the backend too (`smtc.rs`): look cover art up online when a
  // player publishes none, or only its own logo (browsers).
  artLookup: {
    key: "music.artLookup",
    label: "music.artLookup.label",
    description: "music.artLookup.desc",
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
  /** Romanize Devanagari sheets and pick Latin-script provider results. */
  preferHinglish: {
    key: "music.lyrics.hinglish",
    label: "music.lyrics.hinglishLabel",
    description: "music.lyrics.hinglishDesc",
    default: true,
  } satisfies SettingDef,
};

export type BoardEmptyAnim = "face" | "bars" | "notes" | "none";

/** The pop-out lyrics board (its own window; see `src/lyrics`). */
export const lyricsBoardSettings = {
  enabled: {
    key: "music.board.enabled",
    label: "music.board.enabled.label",
    description: "music.board.enabled.desc",
    default: true,
  } satisfies SettingDef,
  emptyAnim: {
    key: "music.board.emptyAnim",
    label: "music.board.emptyAnim.label",
    description: "music.board.emptyAnim.desc",
    default: "face" as BoardEmptyAnim,
  } satisfies SettingDef<BoardEmptyAnim>,
  showEmptyText: {
    key: "music.board.showEmptyText",
    label: "music.board.showEmptyText.label",
    description: "music.board.showEmptyText.desc",
    default: true,
  } satisfies SettingDef,
  nothingText: {
    key: "music.board.nothingText",
    label: "music.board.nothingText.label",
    description: "music.board.nothingText.desc",
    default: "",
  } satisfies SettingDef<string>,
  noLyricsText: {
    key: "music.board.noLyricsText",
    label: "music.board.noLyricsText.label",
    description: "music.board.noLyricsText.desc",
    default: "",
  } satisfies SettingDef<string>,
  /** 0 = album art shows through, 100 = near-solid maroon (the reference look). */
  tint: {
    key: "music.board.tint",
    label: "music.board.tint.label",
    description: "music.board.tint.desc",
    default: 72,
  } satisfies SettingDef<number>,
  /** Backdrop blur radius, in CSS pixels. 0 keeps the cover almost sharp. */
  bgBlur: {
    key: "music.board.blur",
    label: "music.board.blur.label",
    description: "music.board.blur.desc",
    default: 24,
  } satisfies SettingDef<number>,
  autoHideButtons: {
    key: "music.board.autoHide",
    label: "music.board.autoHide.label",
    description: "music.board.autoHide.desc",
    default: true,
  } satisfies SettingDef,
};
