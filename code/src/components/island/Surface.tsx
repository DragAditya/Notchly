import { AnimatePresence, motion, type Transition } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import type { Appearance } from "../../core/appearance";
import { cornerRadius, type Geo } from "./geometry";
import { glowStyle } from "./Rim";

/** The island's black body; its content blurs out and in whenever `contentKey` changes. */
export function Surface({
	g,
	big,
	look,
	transition,
	contentKey,
	rim,
	children,
}: {
	g: Geo;
	big: boolean;
	look: Appearance;
	transition: Transition;
	contentKey: string;
	rim: ReactNode;
	children: ReactNode;
}) {
	const windows = look.style === "windows";
	const speed = Math.max(0.5, look.animationSpeed);
	return (
		<motion.div
			className={`surface ${big ? "is-big" : ""}`}
			style={
				{
					...(windows ? glowStyle(look) : undefined),
					backdropFilter: `blur(${look.backgroundBlur}px) saturate(1.15)`,
					WebkitBackdropFilter: `blur(${look.backgroundBlur}px) saturate(1.15)`,
				} as CSSProperties
			}
			initial={false}
			animate={cornerRadius(g, windows, look.radius)}
			transition={transition}
		>
			<AnimatePresence mode="popLayout" initial={false}>
				<motion.div
					key={contentKey}
					className="content"
					style={{ width: g.width, height: g.height }}
					initial={big ? { opacity: 0, scale: 0.9, filter: "blur(10px)" } : false}
					animate={{
						opacity: 1,
						scale: 1,
						filter: "blur(0px)",
						transition: big
							? { duration: 0.32 / speed, delay: 0.06 / speed, ease: [0.2, 0.9, 0.3, 1] }
							: { duration: 0.12 / speed, ease: [0.2, 0.9, 0.3, 1] },
					}}
					exit={{
						opacity: 0,
						scale: 0.94,
						filter: "blur(8px)",
						transition: { duration: 0.16 / speed, ease: "easeIn" },
					}}
				>
					{children}
				</motion.div>
			</AnimatePresence>
			{rim}
		</motion.div>
	);
}
