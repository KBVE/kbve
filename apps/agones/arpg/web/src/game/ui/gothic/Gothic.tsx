import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
	PANEL_SVG,
	SLOT_SVG,
	TITLEBAR_SVG,
	BUTTON_SVG,
	STRIP_SVG,
	CLOSE_SVG,
	ORB_FRAME_SVG,
	ORB_FRAME_HOLE,
	svgBg,
	GOTHIC,
} from './svg';

// React wrappers over the gothic SVG chrome. Each is a stretched background
// (the kit's frames are authored with preserveAspectRatio="none"), so panels
// can be any size; slots stay square. Content sits in a padded inner box.

const PANEL_BG = svgBg(PANEL_SVG);
const SLOT_BG = svgBg(SLOT_SVG);
const TITLEBAR_BG = svgBg(TITLEBAR_SVG);
const BUTTON_BG = svgBg(BUTTON_SVG);
const STRIP_BG = svgBg(STRIP_SVG);
const CLOSE_BG = svgBg(CLOSE_SVG);
const ORB_FRAME_BG = svgBg(ORB_FRAME_SVG);

/** Hole fraction the orb fluid should fill inside the bezel ring. */
export { ORB_FRAME_HOLE };

const stretch = (bg: string): CSSProperties => ({
	background: `center / 100% 100% no-repeat ${bg}`,
});

// Drives mount + enter/exit transitions: keeps a panel mounted through its exit
// animation, then unmounts after `exitMs`. `shown` flips a frame after mount so
// CSS transitions fire on enter, and flips off before unmount on exit.
export function useMountTransition(
	open: boolean,
	exitMs: number,
): { mounted: boolean; shown: boolean } {
	const [mounted, setMounted] = useState(open);
	const [shown, setShown] = useState(open);
	useEffect(() => {
		if (open) {
			setMounted(true);
			const raf = requestAnimationFrame(() => setShown(true));
			return () => cancelAnimationFrame(raf);
		}
		setShown(false);
		const to = window.setTimeout(() => setMounted(false), exitMs);
		return () => window.clearTimeout(to);
	}, [open, exitMs]);
	return { mounted, shown };
}

export function GothicPanel({
	children,
	padding = 22,
	style,
}: {
	children?: ReactNode;
	padding?: number | string;
	style?: CSSProperties;
}) {
	return (
		<div style={{ ...stretch(PANEL_BG), color: GOTHIC.text, ...style }}>
			<div style={{ padding }}>{children}</div>
		</div>
	);
}

export function GothicSlot({
	children,
	size,
	title,
	style,
	...rest
}: {
	children?: ReactNode;
	size?: number;
	title?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			title={title}
			style={{
				...stretch(SLOT_BG),
				width: size,
				height: size,
				aspectRatio: size ? undefined : '1',
				position: 'relative',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				...style,
			}}
			{...rest}>
			{children}
		</div>
	);
}

export function GothicTitleBar({
	children,
	style,
}: {
	children?: ReactNode;
	style?: CSSProperties;
}) {
	return (
		<div
			style={{
				...stretch(TITLEBAR_BG),
				minHeight: 44,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				font: '700 15px/1 Georgia, serif',
				letterSpacing: 1,
				textShadow: `0 2px 2px ${GOTHIC.shadow}`,
				color: GOTHIC.text,
				...style,
			}}>
			{children}
		</div>
	);
}

export function GothicDivider({ style }: { style?: CSSProperties }) {
	return <div style={{ ...stretch(STRIP_BG), minHeight: 26, ...style }} />;
}

export function GothicCloseButton({
	size = 28,
	style,
	onPointerLeave,
	...rest
}: { size?: number } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
	const [hover, setHover] = useState(false);
	const [down, setDown] = useState(false);
	return (
		<button
			aria-label="Close"
			onPointerEnter={() => setHover(true)}
			onPointerLeave={(e) => {
				setHover(false);
				setDown(false);
				onPointerLeave?.(e);
			}}
			onPointerDown={() => setDown(true)}
			onPointerUp={() => setDown(false)}
			style={{
				...stretch(CLOSE_BG),
				width: size,
				height: size,
				border: 0,
				padding: 0,
				cursor: 'pointer',
				transformOrigin: 'center',
				transform: down
					? 'scale(0.88)'
					: hover
						? 'scale(1.15)'
						: 'scale(1)',
				// Dim + drain hue on press (dismiss), bright bezel otherwise.
				filter: down
					? 'brightness(0.55) saturate(0.5)'
					: 'drop-shadow(0 3px 6px rgba(0,0,0,0.6))',
				transition:
					'transform 0.13s cubic-bezier(0.2,0.8,0.3,1.3), filter 0.13s ease',
				...style,
			}}
			{...rest}
		/>
	);
}

// Gothic bezel ring around an existing orb. `children` (the StatOrb) sits in the
// transparent center; the ring overlays on top with pointer-events off so the
// orb keeps its own hover/tooltip.
export function GothicOrbRing({
	size,
	children,
}: {
	size: number;
	children: ReactNode;
}) {
	return (
		<div
			style={{
				position: 'relative',
				width: size,
				height: size,
				display: 'grid',
				placeItems: 'center',
			}}>
			{children}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					...stretch(ORB_FRAME_BG),
					pointerEvents: 'none',
				}}
			/>
		</div>
	);
}

export function GothicButton({
	children,
	style,
	...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button
			style={{
				...stretch(BUTTON_BG),
				border: 0,
				minWidth: 120,
				minHeight: 40,
				color: GOTHIC.text,
				font: '700 15px/1 Georgia, serif',
				textShadow: `0 2px 2px ${GOTHIC.shadow}`,
				cursor: 'pointer',
				...style,
			}}
			{...rest}>
			{children}
		</button>
	);
}
