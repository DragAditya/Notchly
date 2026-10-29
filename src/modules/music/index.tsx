/**
 * Music module — Spotify and any other player exposed through the Windows
 * media controls (browsers, Apple Music, VLC…). Everything music-related lives
 * in this folder; its backend counterpart is `src-tauri/src/providers/music/`.
 */
import { MusicIcon } from "../../components/icons";
import type { IslandModule, ModuleView } from "../../core/types";
import { Artwork } from "./components/Artwork";
import { MusicCompactLeft, MusicCompactRight } from "./components/MusicCompact";
import { CompactLyrics } from "./components/MusicLyrics";
import { MusicPanel } from "./components/MusicPanel";
import { MusicSettings } from "./components/MusicSettings";
import { useAccentColor } from "./hooks/useAccentColor";
import { useMusic } from "./hooks/useMusic";
import { compactWidth, useLyricLine, useLyrics } from "./lyrics";
import { lyricsSettings, musicSettings } from "./settings";
import { useSetting } from "../../core/settings";
import "./music.css";

export const musicModule: IslandModule = {
  id: "music",
  title: "music.title",
  settingsIcon: <MusicIcon size={15} />,
  settings: Object.values(musicSettings),
  SettingsSection: MusicSettings,
  useView(): ModuleView {
    const { music, active } = useMusic();
    const accent = useAccentColor(music?.thumbnail);
    const autoExpand = useSetting(musicSettings.autoExpand);
    const showVisualizer = useSetting(musicSettings.visualizer);
    const lyricsEnabled = useSetting(lyricsSettings.enabled);
    const lyricsMode = useSetting(lyricsSettings.mode);
    const lyricsOffset = useSetting(lyricsSettings.offset);

    const lyrics = useLyrics(music, lyricsEnabled);
    const offsetMs = Math.round(lyricsOffset * 1000);
    const lineIndex = useLyricLine(music, lyrics, offsetMs);
    const showLyrics = lyricsEnabled && lyrics.synced && lyrics.lines.length > 0;
    const lineText = showLyrics ? (lyrics.lines[Math.max(0, lineIndex)]?.text ?? "") : "";
    const width = showLyrics ? compactWidth(lineText, lyricsMode) : 340;
    // Stable per track: pause/resume must not look like a new track and peek.
    // Browser YouTube videos never auto-expand (they are not music).
    const trackKey = music ? `${music.title}|${music.artist}|${music.album}` : undefined;

    return {
      active,
      priority: music?.playing ? 50 : 10,
      icon: <Artwork src={music?.thumbnail} size={22} radius={11} />,
      compact: music && {
        left: (
          <MusicCompactLeft
            music={music}
            lyric={
              showLyrics ? (
                <CompactLyrics
                  mode={lyricsMode}
                  music={music}
                  lyrics={lyrics}
                  index={lineIndex}
                  offsetMs={offsetMs}
                />
              ) : undefined
            }
          />
        ),
        right: <MusicCompactRight music={music} accent={accent} showVisualizer={showVisualizer} />,
        width,
      },
      expanded: (
        <MusicPanel
          music={music}
          accent={accent}
          showVisualizer={showVisualizer}
          lyrics={showLyrics ? lyrics : undefined}
          lineIndex={lineIndex}
          offsetMs={offsetMs}
        />
      ),
      // Wider only when the lyric column is there; the rest of the panel is untouched.
      expandedSize: { width: showLyrics ? 700 : 560, height: 176 },
      activityKey: autoExpand && music?.available && !music.youtube ? trackKey : undefined,
    };
  },
};
