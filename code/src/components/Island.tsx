import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { modules } from "../modules";
import { useHitRects } from "../core/useHitRects";
import { useIslandController } from "../core/useIslandController";
import { useIslandDrag } from "../core/useIslandDrag";
import { IslandContext, type IslandApi } from "../core/island";
import { useAppearance } from "../core/appearance";
import { useTauriEvent } from "../core/bridge";
import { useSyncLocale, useT } from "../core/i18n";
import { companionSettings, generalSettings, useSetting } from "../core/settings";
import { useCompanion } from "../companion/useCompanion";
import {
	chatRequest,
	instantPrompt,
	islandAnswer,
	requestAskFocus,
	requestAskInstant,
	type AskMessage,
} from "../modules/ask/store";
import { requestFindFocus } from "../modules/find/store";
import { AmbientBubbles, SecondaryBubble } from "./island/Bubbles";
import { islandContent } from "./island/content";
import { ambientWidth, BUBBLE, BUBBLE_GAP, companionGeometry, geometry, variantOf } from "./island/geometry";
import { launcherSize } from "./island/Launcher";
import { Rim } from "./island/Rim";
import { Surface } from "./island/Surface";
import { useIslandFileDrop } from "./island/useIslandFileDrop";

export function Island() {
	const ctl = useIslandController(modules);
	const t = useT();
	const { mode, primary, secondary, focused } = ctl;
	const look = useAppearance();
	const windows = look.style === "windows";
	const v = variantOf(look);
	const intensity = useSetting(companionSettings.intensity);
	const speed = useSetting(companionSettings.speed);
	const glow = useSetting(companionSettings.glow);
	const reduceMotion = useSetting(companionSettings.reduceMotion);
	const clickThrough = useSetting(generalSettings.lockClickThrough);
	const lockClickThrough = ctl.locked && clickThrough;
	const motionIntensity = intensity === "energetic" ? 1.45 : intensity === "calm" ? 0.68 : 1;
	const motionScale = 1 / Math.max(0.5, speed * look.animationSpeed);
	const stageStyle = {
		"--motion-scale": String(motionScale),
		"--motion-intensity": String(motionIntensity),
		"--motion-glow": glow ? "1" : "0",
		"--island-bg-alpha": String(1 - Math.min(0.3, look.backgroundBlur / 80)),
		"--island-blur": `${look.backgroundBlur}px`,
		"--island-scale": String(look.scale),
		"--rim-speed": `${look.borderSpeed}s`,
	} as CSSProperties;
	useHitRects();
	useSyncLocale();
	useIslandFileDrop(ctl);

	const bigSize = ctl.launcher ? launcherSize(ctl.entries.length) : focused?.view.expandedSize;
	const hideTabs = !ctl.launcher && !!focused?.view.hideTabs;
	const companion = useCompanion({
		islandMode: mode,
		fullscreen: ctl.fullscreen,
		hovered: ctl.hoverAction === "companion" && ctl.hovering,
		locked: ctl.locked,
	});
	const showCompanion = companion.visible && mode === "idle" && !ctl.locked;
	const g = showCompanion
		? companionGeometry(v, look)
		: geometry(v, look, mode, bigSize, primary, hideTabs);
	const big = mode === "expanded" || mode === "peek";
	const hidden = mode === "hidden";
	const swallowed = mode === "swallowed";
	const resting = mode === "compact" || mode === "idle";
	const showSecondary = mode === "compact" && secondary !== undefined;
	// A spring's frequency scales with sqrt(stiffness); keeping the damping ratio
	// means damping scales with the same factor as the speed.
	const speedUp = (t: typeof v.shellSpring) => ({
		...t,
		stiffness: typeof t.stiffness === "number" ? t.stiffness * look.animationSpeed ** 2 : t.stiffness,
		damping: typeof t.damping === "number" ? t.damping * look.animationSpeed : t.damping,
	});
	const transition = speedUp(big ? v.expandSpring : v.shellSpring);

	// Short red shake when a locked notch is clicked; a green pulse confirms an
	// unlock (and a red one confirms a lock) when the shortcut toggles it.
	const [lockFeedback, setLockFeedback] = useState<"locked" | "unlocked" | null>(null);
	const lockFeedbackTimer = useRef<number | undefined>(undefined);
	const lockFeedbackFrame = useRef<number | undefined>(undefined);
	const pulseLock = useCallback((kind: "locked" | "unlocked") => {
		window.clearTimeout(lockFeedbackTimer.current);
		if (lockFeedbackFrame.current !== undefined) window.cancelAnimationFrame(lockFeedbackFrame.current);
		setLockFeedback(null);
		lockFeedbackFrame.current = window.requestAnimationFrame(() => {
			setLockFeedback(kind);
			lockFeedbackTimer.current = window.setTimeout(() => setLockFeedback(null), 700);
		});
	}, []);
	const wasLocked = useRef(ctl.locked);
	useEffect(() => {
		if (wasLocked.current === ctl.locked) return;
		wasLocked.current = ctl.locked;
		pulseLock(ctl.locked ? "locked" : "unlocked");
	}, [ctl.locked, pulseLock]);
	useEffect(
		() => () => {
			window.clearTimeout(lockFeedbackTimer.current);
			if (lockFeedbackFrame.current !== undefined) window.cancelAnimationFrame(lockFeedbackFrame.current);
		},
		[],
	);

	const drag = useIslandDrag({
		width: g.width,
		leftExtra: g.ear + (resting ? ambientWidth(ctl.entries.filter((e) => e.view.ambient).length) : 0),
		rightExtra: g.ear + (showSecondary ? BUBBLE_GAP + BUBBLE : 0),
		canReturn: !big,
		disabled: ctl.locked,
		onDragChange: ctl.lockHover,
	});

	// A drag makes the companion dizzy for a moment.
	useEffect(() => {
		if (drag.dragging) companion.react("drag");
	}, [drag.dragging, companion.react]);

	// Global shortcut: the page opens (controller) and its input takes the keyboard.
	useTauriEvent("island://ask", requestAskFocus);
	// Custom "instant prompt" shortcut: one-line field, keyboard ready.
	useTauriEvent("island://ask-instant", requestAskInstant);
	useTauriEvent("island://find", requestFindFocus);

	// A compact question came back: unfold the island on its answer exactly once.
	const answer = islandAnswer.use();
	const openedAnswer = useRef<AskMessage | null>(null);
	const answerShown = useRef(false);
	useEffect(() => {
		if (!answer) {
			openedAnswer.current = null;
			answerShown.current = false;
			return;
		}
		if (mode === "expanded" || mode === "peek") answerShown.current = true;
		if (openedAnswer.current === answer) return;
		openedAnswer.current = answer;
		if (mode !== "expanded") ctl.expand("ask");
	}, [answer, mode, ctl.expand]);

	// Collapsing drops the one-shot Ask surfaces. A reply that was already on
	// screen goes too, so the next open starts at a fresh prompt.
	useEffect(() => {
		if (mode === "expanded" || mode === "peek") return;
		if (instantPrompt.get()) instantPrompt.set(false);
		if (chatRequest.get()) chatRequest.set(false);
		if (answerShown.current) {
			answerShown.current = false;
			islandAnswer.set(null);
		}
	}, [mode]);

	const api: IslandApi = useMemo(
		() => ({ mode, tab: ctl.tab, expand: ctl.expand, collapse: ctl.collapse, keepOpen: ctl.keepOpen }),
		[mode, ctl.tab, ctl.expand, ctl.collapse, ctl.keepOpen],
	);

	const content = islandContent(ctl, look, v, companion);
	const rim = windows ? <Rim look={look} /> : null;
	const bubble = { transition, rim, onOpen: ctl.expand };

	return (
		<IslandContext.Provider value={api}>
			<div
				className="stage"
				style={stageStyle}
				data-density={look.density}
				data-reduce-motion={reduceMotion ? "always" : undefined}
				data-lock-clickthrough={lockClickThrough ? "true" : undefined}
			>
				{/* The tray's black hole: the island spins into its own center and comes back out. */}
				<motion.div
					className="blackhole"
					initial={false}
					animate={swallowed ? { scale: 0, rotate: -200, opacity: 0 } : { scale: 1, rotate: 0, opacity: 1 }}
					transition={
						swallowed
							? { duration: 0.46, ease: [0.55, 0, 1, 0.45] }
							: { duration: 0.56, ease: [0.34, 1.4, 0.64, 1], opacity: { duration: 0.26 } }
					}
				>
					<motion.div
						className={`shell ${windows ? "is-windows" : "is-dynamic"} ${drag.dragging ? "is-dragging" : ""} ${
							ctl.locked ? "is-locked" : ""
						} ${lockClickThrough ? "is-lock-clickthrough" : ""} ${
							lockFeedback === "locked" ? "is-lock-hit" : ""
						} ${lockFeedback === "unlocked" ? "is-unlock-hit" : ""}`}
						{...(hidden || swallowed || lockClickThrough ? {} : { "data-hit": true })}
						{...ctl.domHover}
						style={{ ...drag.style, marginTop: v.top }}
						onPointerDown={drag.onPointerDown}
						onClickCapture={(e) => {
							if (ctl.locked) {
								e.preventDefault();
								e.stopPropagation();
								pulseLock("locked");
								return;
							}
							drag.onClickCapture(e);
						}}
						onUpdate={drag.onShellUpdate}
						onWheel={ctl.onWheel}
						initial={false}
						animate={{
							width: g.width,
							height: g.height,
							opacity: hidden ? 0 : 1,
							y: hidden ? -g.height - 12 - v.top : 0,
						}}
						transition={transition}
						onClick={() => resting && !ctl.locked && ctl.expand()}
					>
						<motion.span className="ear left" initial={false} animate={{ width: g.ear, height: g.ear }} transition={transition} />
						<motion.span className="ear right" initial={false} animate={{ width: g.ear, height: g.ear }} transition={transition} />

						<Surface
							g={g}
							big={big}
							look={look}
							transition={transition}
							contentKey={content.key}
							rim={rim}
						>
							{content.node}
						</Surface>

						{lockFeedback && (
							<span className={`lock-toast ${lockFeedback}`} role="status" aria-live="polite">
								{lockFeedback === "locked" ? t("island.lock.locked") : t("island.lock.unlocked")}
							</span>
						)}

						<AmbientBubbles entries={ctl.entries} visible={resting && !ctl.locked} shrunk={mode === "idle" && !windows} {...bubble} />
						<SecondaryBubble entry={showSecondary ? secondary : undefined} {...bubble} />
					</motion.div>
				</motion.div>
			</div>
		</IslandContext.Provider>
	);
}
