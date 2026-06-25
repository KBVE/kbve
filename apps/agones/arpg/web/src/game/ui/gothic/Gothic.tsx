import type { CSSProperties, ReactNode } from 'react';
import {
	PANEL_SVG,
	SLOT_SVG,
	TITLEBAR_SVG,
	BUTTON_SVG,
	STRIP_SVG,
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

const stretch = (bg: string): CSSProperties => ({
	background: `center / 100% 100% no-repeat ${bg}`,
});

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
