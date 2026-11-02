import { useCallback, useEffect, useRef, useState } from "react";
import { command, useProvider, useTauriEvent } from "../core/bridge";
import { companionSettings, setSetting, useCompanionMode, useSetting } from "../core/settings";
import { ACTIVITIES_PROVIDER, type ActivitiesState, type Activity } from "../modules/activities/types";
import { MUSIC_PROVIDER, type MusicState } from "../modules/music/hooks/useMusic";
import { MoodEngine, type ReactionState } from "./mood";
import type { CompanionEvent, CompanionMode, Mood } from "./types";

interface Options {
	/** The island's mode (`idle`, `compact`, `expanded`, …). */
	islandMode: string;
	/** A fullscreen app, presentation or busy state is in front. */
	fullscreen: boolean;
	/** The pointer is on the resting island and the hover action pops the companion. */
	hovered?: boolean;
}

export interface CompanionController {
	visible: boolean;
	mood: Mood;
	mode: CompanionMode;
	react: (event: CompanionEvent) => void;
	summon: (ms?: number) => void;
	dismiss: () => void;
	toggleMode: () => void;
}

const SUPPRESS_AFTER_DISMISS_MS = 45_000;
const SUMMON_MS = 20_000;

/**
 * Connects the safe provider signals to the local mood model and decides
 * whether the eyes belong in the resting island right now.
 *
 * Eyes and Mixed keep the companion on compact surfaces. `resting` decides
 * whether the idle eyes stay visible or only appear after a signal. Off and
 * Live activities leave the island to the normal cards; Off also stops the
 * automatic reactions.
 */
export function useCompanion({ islandMode, fullscreen, hovered = false }: Options): CompanionController {
	const mode = useCompanionMode();
	const resting = useSetting(companionSettings.resting);
	const engineRef = useRef<MoodEngine | null>(null);
	if (!engineRef.current) engineRef.current = new MoodEngine();
	const engine = engineRef.current;

	const [reaction, setReaction] = useState<ReactionState | null>(null);
	const [summonUntil, setSummonUntil] = useState(0);
	const [suppressUntil, setSuppressUntil] = useState(0);
	const [idleSecs, setIdleSecs] = useState(0);

	const music = useProvider<MusicState>(MUSIC_PROVIDER);
	const activities = useProvider<ActivitiesState>(ACTIVITIES_PROVIDER);

	const react = useCallback(
		(event: CompanionEvent) => {
			// Off and Live activities keep the companion out of the way entirely.
			if (mode === "off" || mode === "activities") return;
			const next = engine.react(event);
			if (next) setReaction(next);
		},
		[engine, mode],
	);

	const summon = useCallback(
		(ms = SUMMON_MS) => {
			const now = Date.now();
			setSuppressUntil(0);
			setSummonUntil(now + ms);
			const next = engine.react("summon", now);
			if (next) setReaction(next);
		},
		[engine],
	);

	const dismiss = useCallback(() => {
		const now = Date.now();
		engine.dismiss(now);
		setReaction(null);
		setSummonUntil(0);
		setSuppressUntil(now + SUPPRESS_AFTER_DISMISS_MS);
	}, [engine]);

	const toggleMode = useCallback(() => {
		const next: CompanionMode = mode === "off" ? "mixed" : "off";
		setSetting(companionSettings.mode, next);
		if (next === "mixed") {
			summon(6_000);
		} else {
			// Off means off now, even if the eyes were just summoned.
			engine.dismiss();
			setReaction(null);
			setSummonUntil(0);
			setSuppressUntil(0);
		}
	}, [mode, summon, engine]);

	// A reaction fades back to the ambient mood (or away, in Auto).
	useEffect(() => {
		if (!reaction) return;
		const left = reaction.until - Date.now();
		if (left <= 0) {
			setReaction(null);
			return;
		}
		const id = window.setTimeout(() => setReaction(null), left + 30);
		return () => window.clearTimeout(id);
	}, [reaction]);

	useEffect(() => {
		if (!summonUntil) return;
		const left = summonUntil - Date.now();
		if (left <= 0) {
			setSummonUntil(0);
			return;
		}
		const id = window.setTimeout(() => setSummonUntil(0), left + 30);
		return () => window.clearTimeout(id);
	}, [summonUntil]);

	useEffect(() => {
		if (!suppressUntil) return;
		const left = suppressUntil - Date.now();
		if (left <= 0) {
			setSuppressUntil(0);
			return;
		}
		const id = window.setTimeout(() => setSuppressUntil(0), left + 30);
		return () => window.clearTimeout(id);
	}, [suppressUntil]);

	// Music: a new track, pause and resume are the useful moments.
	const previousMusic = useRef<MusicState | undefined>(undefined);
	useEffect(() => {
		const previous = previousMusic.current;
		previousMusic.current = music;
		if (!previous || !music) return;
		const track = `${music.title}|${music.artist}|${music.album}`;
		const previousTrack = `${previous.title}|${previous.artist}|${previous.album}`;
		if (music.playing && previous.playing && track !== previousTrack) {
			react("music-skip");
		} else if (previous.playing !== music.playing) {
			react(music.playing ? "music-play" : "music-pause");
		}
	}, [music, react]);

	// System activities: volume, brightness, battery, Bluetooth and notifications.
	const seenActivities = useRef<Map<string, number> | null>(null);
	useEffect(() => {
		const items = activities?.items ?? [];
		const next = new Map(items.map((item) => [item.id, item.updatedAt]));
		const previous = seenActivities.current;
		seenActivities.current = next;
		if (!previous) return;
		for (const item of items) {
			if (previous.get(item.id) === item.updatedAt) continue;
			const event = eventForActivity(item);
			if (event) react(event);
		}
	}, [activities, react]);

	// Idle time comes from the backend's safe `GetLastInputInfo` call.
	useEffect(() => {
		let alive = true;
		const load = () => {
			command<number>("companion_idle_seconds").then((value) => {
				if (alive && typeof value === "number") setIdleSecs(value);
			});
		};
		load();
		const id = window.setInterval(load, 15_000);
		return () => {
			alive = false;
			window.clearInterval(id);
		};
	}, []);

	// A short welcome when the user comes back after a while.
	const wasIdle = useRef(false);
	useEffect(() => {
		const idle = idleSecs >= 90;
		if (wasIdle.current && !idle) react("welcome-back");
		wasIdle.current = idle;
	}, [idleSecs, react]);

	// Occasional quiet quirks only while the user is away. Auto mode shows
	// them briefly; during active work it stays out of the way.
	const idle = idleSecs >= 120;
	const eyesOn = mode === "eyes" || mode === "mixed";
	useEffect(() => {
		if (!idle || !eyesOn) return;
		const id = window.setInterval(() => {
			if (Math.random() < 0.45) react("idle-quirk");
		}, 75_000);
		return () => window.clearInterval(id);
	}, [idle, eyesOn, react]);

	const now = Date.now();
	const reactionActive = !!reaction && reaction.until > now;
	const summonActive = summonUntil > now;
	const suppressed = suppressUntil > now;
	const visible =
		!fullscreen &&
		islandMode === "idle" &&
		!suppressed &&
		eyesOn &&
		(summonActive || reactionActive || resting || hovered);
	const mood: Mood = summonActive ? "love" : reactionActive ? reaction.mood : engine.ambient(idleSecs, !!music?.playing);

	const toggleVisible = useCallback(() => {
		if (visible) dismiss();
		else summon();
	}, [visible, dismiss, summon]);

	useTauriEvent("companion://summon", toggleVisible);
	useTauriEvent("companion://toggle", toggleMode);

	return { visible, mood, mode, react, summon, dismiss, toggleMode };
}

/** Map an activity to the mood it should trigger, ignoring unrelated ones. */
function eventForActivity(activity: Activity): CompanionEvent | null {
	if (activity.source === "notification") return "notification";
	if (activity.id.startsWith("system.volume")) return "volume";
	if (activity.id.startsWith("system.brightness")) return "brightness";
	if (activity.id.startsWith("system.battery")) {
		if (activity.icon === "charging") return "charging";
		if (activity.progress != null && activity.progress <= 0.2) return "low-battery";
		return "battery-change";
	}
	if (activity.id.startsWith("system.bluetooth")) {
		if (activity.id.includes(".low") || (activity.progress != null && activity.progress <= 0.2)) return "low-battery";
		if (activity.id.includes(".disconnected")) return "bluetooth-disconnect";
		return "bluetooth";
	}
	if (activity.id.startsWith("system.wifi")) {
		if (activity.id.includes(".disconnected") || activity.id.includes(".searching")) return "wifi-disconnect";
		return "wifi";
	}
	if (activity.source === "monitor") return "monitor-alert";
	return null;
}
