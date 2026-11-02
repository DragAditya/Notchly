/**
 * The companion's local mood model.
 *
 * This is deliberately small and local: weighted reactions decay over time,
 * repeated signals become less novel, and an idle companion settles into a
 * calmer mood. Nothing leaves the machine and no content is inspected — the
 * only inputs are the safe events listed in `CompanionEvent`.
 */
import type { CompanionEvent, Mood } from "./types";

interface Reaction {
	mood: Mood;
	/** How long the expression stays on screen. */
	hold: number;
	/** How strongly this signal competes with the expression already showing. */
	weight: number;
	/** A direct answer to the user (summon) always wins. */
	force?: boolean;
}

export interface ReactionState {
	mood: Mood;
	/** Unix ms when the expression should fade back to the ambient mood. */
	until: number;
	started: number;
	weight: number;
	event: CompanionEvent;
}

const REACTIONS: Record<CompanionEvent, Reaction> = {
	"music-play": { mood: "happy", hold: 3_800, weight: 3 },
	"music-pause": { mood: "curious", hold: 2_800, weight: 2.2 },
	"music-skip": { mood: "excited", hold: 3_400, weight: 4.2 },
	volume: { mood: "curious", hold: 2_400, weight: 1.6 },
	brightness: { mood: "curious", hold: 2_400, weight: 1.6 },
	charging: { mood: "charging", hold: 5_000, weight: 3.2 },
	"low-battery": { mood: "low", hold: 6_000, weight: 4.5 },
	"battery-change": { mood: "curious", hold: 3_000, weight: 2.2 },
	notification: { mood: "surprised", hold: 4_200, weight: 4 },
	bluetooth: { mood: "happy", hold: 3_400, weight: 2.5 },
	"bluetooth-disconnect": { mood: "curious", hold: 3_000, weight: 2.8 },
	wifi: { mood: "happy", hold: 3_200, weight: 2.4 },
	"wifi-disconnect": { mood: "low", hold: 4_200, weight: 3.2 },
	"monitor-alert": { mood: "alert", hold: 4_600, weight: 4 },
	drag: { mood: "dizzy", hold: 2_600, weight: 6 },
	summon: { mood: "love", hold: 20_000, weight: 20, force: true },
	"welcome-back": { mood: "love", hold: 4_000, weight: 3.4 },
	"idle-quirk": { mood: "curious", hold: 4_000, weight: 1 },
};

/** Ignore rapid repeats of the same signal (volume ticks, mostly). */
const COOLDOWN: Partial<Record<CompanionEvent, number>> = {
	"music-play": 1_000,
	"music-pause": 1_000,
	"music-skip": 1_200,
	volume: 700,
	brightness: 700,
	"battery-change": 2_000,
	notification: 2_000,
	bluetooth: 3_000,
	"bluetooth-disconnect": 3_000,
	wifi: 3_000,
	"wifi-disconnect": 3_000,
	"monitor-alert": 5_000,
	"idle-quirk": 45_000,
};

const DECAY_MS = 9_000;
const SCORE_FLOOR = 0.08;
const HISTORY_MS = 25_000;
const HISTORY_LIMIT = 32;
const QUIRK_MOODS: Mood[] = ["curious", "happy", "sleepy", "dizzy", "love"];

export class MoodEngine {
	private scores = new Map<Mood, number>();
	private current: ReactionState | null = null;
	private lastDecay = 0;
	private lastEventAt = new Map<CompanionEvent, number>();
	private history: { event: CompanionEvent; at: number }[] = [];

	/**
	 * Feed one signal to the model. Returns the expression it wants to show,
	 * or `null` when the signal was a rapid repeat and nothing changed.
	 */
	react(event: CompanionEvent, now = Date.now()): ReactionState | null {
		this.decay(now);

		const cooldown = COOLDOWN[event] ?? 0;
		const previousAt = this.lastEventAt.get(event) ?? 0;
		if (cooldown && now - previousAt < cooldown) {
			return this.current && this.current.until > now ? this.current : null;
		}

		const base = REACTIONS[event];
		const mood = event === "idle-quirk" ? randomMood() : base.mood;
		const repeats = this.history.filter((h) => h.event === event && now - h.at < HISTORY_MS).length;
		const novelty = Math.max(0.55, 1 - repeats * 0.12);
		const familiarity = Math.min(1, (this.scores.get(mood) ?? 0) * 0.08);
		const weight = base.weight * novelty * (1 + familiarity);

		this.lastEventAt.set(event, now);
		this.scores.set(mood, (this.scores.get(mood) ?? 0) + weight);
		this.history.push({ event, at: now });
		this.history = this.history.filter((h) => now - h.at < HISTORY_MS).slice(-HISTORY_LIMIT);

		const active = this.current && this.current.until > now ? this.current : null;
		// A small signal may add to the mood's score without interrupting a
		// stronger expression that is already playing.
		if (!base.force && active && weight < active.weight * 0.9) return active;

		const next: ReactionState = {
			mood,
			until: now + base.hold,
			started: now,
			weight,
			event,
		};
		this.current = next;
		return next;
	}

	/** The expression that should be showing at `now` (including ambient). */
	mood(now: number, idleSecs: number, musicPlaying: boolean): Mood {
		if (this.current && this.current.until > now) return this.current.mood;
		return this.ambient(idleSecs, musicPlaying);
	}

	/** The mood an idle companion rests in. */
	ambient(idleSecs: number, musicPlaying: boolean): Mood {
		if (idleSecs >= 300) return "sleepy";
		if (musicPlaying) return "music";
		return "calm";
	}

	/** Clear the current reaction, learning a little from a quick dismissal. */
	dismiss(now = Date.now()) {
		if (this.current && now - this.current.started < 1_500) {
			const score = this.scores.get(this.current.mood) ?? 0;
			this.scores.set(this.current.mood, Math.max(0, score - 0.6));
		}
		this.current = null;
	}

	private decay(now: number) {
		if (!this.lastDecay) {
			this.lastDecay = now;
			return;
		}
		const elapsed = now - this.lastDecay;
		if (elapsed < 1_000) return;
		const factor = Math.exp(-elapsed / DECAY_MS);
		for (const [mood, score] of this.scores) {
			const next = score * factor;
			if (next < SCORE_FLOOR) this.scores.delete(mood);
			else this.scores.set(mood, next);
		}
		this.lastDecay = now;
	}
}

function randomMood(): Mood {
	return QUIRK_MOODS[Math.floor(Math.random() * QUIRK_MOODS.length)] ?? "curious";
}
