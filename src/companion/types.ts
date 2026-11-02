/** How the companion shares the compact island with live activities. */
export type { CompanionMode } from "../core/settings";

/** The expression the eyes are wearing right now. */
export type Mood =
	| "calm"
	| "curious"
	| "happy"
	| "excited"
	| "alert"
	| "dizzy"
	| "sleepy"
	| "charging"
	| "low"
	| "music"
	| "love"
	| "surprised";

/** Safe, local signals the companion may react to. */
export type CompanionEvent =
	| "music-play"
	| "music-pause"
	| "music-skip"
	| "volume"
	| "brightness"
	| "charging"
	| "low-battery"
	| "battery-change"
	| "notification"
	| "bluetooth"
	| "bluetooth-disconnect"
	| "wifi"
	| "wifi-disconnect"
	| "monitor-alert"
	| "drag"
	| "summon"
	| "welcome-back"
	| "idle-quirk";

/** What the island needs to know to draw the companion. */
export interface CompanionView {
	visible: boolean;
	mood: Mood;
}
