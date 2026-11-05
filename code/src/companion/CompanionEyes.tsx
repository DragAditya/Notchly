import { useEffect, useRef, useState, type CSSProperties } from "react";
import { companionSettings, useSetting } from "../core/settings";
import type { Mood } from "./types";
import "./companion.css";

type PetAction = "rest" | "look-left" | "look-right" | "peek" | "squint" | "perk";

const ACTIONS: PetAction[] = ["look-left", "look-right", "peek", "squint", "perk"];

/** The compact music choreographies. */
export type DanceStyle = "groove" | "bounce" | "shimmy" | "wave" | "spin" | "hop";

interface CompanionEyesProps {
	mood: Mood;
	className?: string;
	style?: CSSProperties;
	/** A dance loop for the compact music player. */
	dance?: DanceStyle;
	/** Stops the dance without losing the current pose. */
	paused?: boolean;
	/** Bluetooth searching: a slow side-to-side listen. */
	searching?: boolean;
	/** Follow the pointer while it is near the island. */
	gaze?: boolean;
}

/**
 * The companion is eyes only: no face, no mouth, no body. The look is deliberately
 * simple and graphic, like a tiny glowing pet: oval eyes, arcs, hearts, chevrons
 * and spirals. There are no pupils or realistic eye details.
 *
 * On top of the mood, a small set of autonomous behaviours keeps it feeling alive:
 * it breathes, blinks, glances around, squints and occasionally perks up. The
 * whole eye pair leans toward the pointer while it is near the island.
 */
export function CompanionEyes({ mood, className, style, dance, paused, searching, gaze = true }: CompanionEyesProps) {
	const root = useRef<HTMLDivElement>(null);
	const [action, setAction] = useState<PetAction>("rest");
	const eyeColor = useSetting(companionSettings.eyeColor);
	const blinkRate = useSetting(companionSettings.blinkRate);
	const gazeFollow = useSetting(companionSettings.gazeFollow);
	const followsPointer = gaze && gazeFollow;
	const eyeStyle = {
		...style,
		"--blink-duration": `${Math.min(20, Math.max(2, blinkRate))}s`,
		...(eyeColor
			? {
					"--eye-color": eyeColor,
					"--eye-glow": `color-mix(in srgb, ${eyeColor} 55%, transparent)`,
				}
			: undefined),
	} as CSSProperties;

	// Little autonomous behaviours, deliberately irregular so they do not
	// read as a looping animation. A dance or a held expression owns the body.
	useEffect(() => {
		if (dance || mood === "dizzy" || mood === "sleepy" || mood === "charging") {
			setAction("rest");
			return;
		}
		let alive = true;
		let wait = 0;
		let hold = 0;
		const schedule = () => {
			wait = window.setTimeout(() => {
				if (!alive) return;
				setAction(ACTIONS[Math.floor(Math.random() * ACTIONS.length)] ?? "look-right");
				hold = window.setTimeout(() => {
					if (!alive) return;
					setAction("rest");
					schedule();
				}, 650 + Math.random() * 700);
			}, 2_300 + Math.random() * 3_900);
		};
		schedule();
		return () => {
			alive = false;
			window.clearTimeout(wait);
			window.clearTimeout(hold);
		};
	}, [mood, dance]);

	// The eye pair leans toward the pointer while it is over the island window.
	useEffect(() => {
		if (!followsPointer) return;
		let last = 0;
		const reset = () => {
			root.current?.style.setProperty("--gaze-x", "0px");
			root.current?.style.setProperty("--gaze-y", "0px");
		};
		const onMove = (event: PointerEvent) => {
			const node = root.current;
			if (!node) return;
			const now = performance.now();
			if (now - last < 32) return;
			last = now;
			const rect = node.getBoundingClientRect();
			const x = clamp((event.clientX - (rect.left + rect.width / 2)) / 140, -1, 1);
			const y = clamp((event.clientY - (rect.top + rect.height / 2)) / 80, -1, 1);
			node.style.setProperty("--gaze-x", `${(x * 2.4).toFixed(2)}px`);
			node.style.setProperty("--gaze-y", `${(y * 1.6).toFixed(2)}px`);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("blur", reset);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("blur", reset);
		};
	}, [followsPointer]);

	return (
		<div
			ref={root}
			className={`companion-eyes${className ? ` ${className}` : ""}`}
			data-mood={mood}
			data-action={action}
			data-dance={dance}
			data-paused={paused ? "true" : undefined}
			data-searching={searching ? "true" : undefined}
			style={eyeStyle}
			aria-hidden="true"
		>
			<Eye side="left" mood={mood} />
			<Eye side="right" mood={mood} />
		</div>
	);
}

function Eye({ side, mood }: { side: "left" | "right"; mood: Mood }) {
	if (mood === "dizzy") {
		return (
			<span className={`companion-eye is-spiral ${side}`}>
				<span className="companion-blinker">
					<svg viewBox="0 0 24 24">
						<path d="M12 12c0-2 3-2 3 0s-4 3-5 0 2-5 5-3 3 7-2 8-8-4-6-8 8-4 9 1" />
					</svg>
				</span>
			</span>
		);
	}
	if (mood === "love") {
		return (
			<span className={`companion-eye is-heart ${side}`}>
				<span className="companion-blinker">
					<svg viewBox="0 0 24 24">
						<path d="M12 21s-8-4.8-8-11a4.6 4.6 0 0 1 8-3.1A4.6 4.6 0 0 1 20 10c0 6.2-8 11-8 11z" />
					</svg>
				</span>
			</span>
		);
	}
	if (mood === "excited") {
		return (
			<span className={`companion-eye is-chevron ${side}`}>
				<span className="companion-blinker">
					<svg viewBox="0 0 24 24">
						<path d={side === "left" ? "M8 4 L17 12 L8 20" : "M16 4 L7 12 L16 20"} />
					</svg>
				</span>
			</span>
		);
	}
	if (mood === "happy" || mood === "music" || mood === "sleepy" || mood === "low") {
		const down = mood === "sleepy" || mood === "low";
		return (
			<span className={`companion-eye is-arc ${side}`}>
				<span className="companion-blinker">
					<svg viewBox="0 0 24 12">
						<path d={down ? "M3 3 Q12 10 21 3" : "M3 9 Q12 2 21 9"} />
					</svg>
				</span>
			</span>
		);
	}
	return (
		<span className={`companion-eye ${side}`}>
			<span className="companion-blinker">
				<span className="companion-eye-shape" />
			</span>
		</span>
	);
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}
