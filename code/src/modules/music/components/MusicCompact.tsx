import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { Marquee } from "../../../components/Marquee";
import { MusicIcon } from "../../../components/icons";
import { CompanionEyes, type DanceStyle } from "../../../companion/CompanionEyes";
import { companionSettings, useCompanionMode, useSetting } from "../../../core/settings";
import { formatTime, useLivePosition, type MusicState } from "../hooks/useMusic";
import { musicSettings } from "../settings";
import { Artwork } from "./Artwork";
import { Visualizer } from "./Visualizer";

const DANCES: DanceStyle[] = ["groove", "bounce", "shimmy", "wave", "spin", "hop"];

/**
 * Left slot of the compact pill. The eyes dance in time with the player and
 * the tiny album chip keeps the track identity without taking the lead.
 */
export function MusicCompactLeft({ music, lyric }: { music: MusicState; lyric?: ReactNode }) {
  const mode = useCompanionMode();
  const musicEyes = useSetting(companionSettings.musicEyes);
  const dancePref = useSetting(companionSettings.dance);
  const showArtwork = useSetting(musicSettings.showArtwork);
  const [danceIndex, setDanceIndex] = useState(0);

  useEffect(() => {
    if (!music.playing || dancePref !== "auto") return;
    const id = window.setInterval(() => setDanceIndex((index) => (index + 1) % DANCES.length), 5_200);
    return () => window.clearInterval(id);
  }, [music.playing, dancePref]);

  const eyesOn = (mode === "eyes" || mode === "mixed") && musicEyes;
  const eyesOnly = mode === "eyes" && musicEyes;
  const dance = dancePref === "auto" ? DANCES[danceIndex] : dancePref;
  const eyes = eyesOn ? (
    <span className="music-compact-eyes" aria-hidden="true">
      <span className="music-dance-spark left" />
      <span className="music-dance-spark right" />
      <CompanionEyes
        mood={music.playing ? "music" : "calm"}
        dance={music.playing ? dance : undefined}
        paused={!music.playing}
        gaze={false}
      />
      {showArtwork && <Artwork src={music.thumbnail} size={13} radius={4} trackKey={music.title} />}
    </span>
  ) : showArtwork ? (
    <Artwork src={music.thumbnail} size={24} radius={7} trackKey={music.title} />
  ) : (
    <span className="music-compact-icon" aria-hidden="true">
      <MusicIcon size={16} />
    </span>
  );

  // Eyes mode: the eyes are the whole compact surface. Mixed keeps the track
  // copy; Live activities and Off show the normal artwork + copy.
  if (eyesOnly) return <>{eyes}</>;
  if (lyric) {
    return (
      <>
        {eyes}
        {lyric}
      </>
    );
  }
  return (
    <>
      {eyes}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={`${music.title}|${music.artist}`}
          className="music-compact-titles"
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
          transition={{ duration: 0.25 }}
        >
          <Marquee text={music.title} className="music-compact-title" />
          {music.artist && <Marquee text={music.artist} className="music-compact-artist" />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

/** Right slot: live playback position + optional visualizer. */
export function MusicCompactRight({
  music,
  accent,
  showVisualizer,
}: {
  music: MusicState;
  accent: string;
  showVisualizer: boolean;
}) {
  const mode = useCompanionMode();
  const musicEyes = useSetting(companionSettings.musicEyes);
  const position = useLivePosition(music);
  // Eyes mode is deliberately minimal: no clock, no visualizer, just the face.
  if (mode === "eyes" && musicEyes) return null;
  return (
    <>
      <span className={`music-compact-time${music.playing ? "" : " is-paused"}`}>{formatTime(position)}</span>
      {showVisualizer && <Visualizer playing={music.playing} color={accent} />}
    </>
  );
}
