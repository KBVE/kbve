import type { CSSProperties } from 'react';

// Small inline line-icons (lucide-style path data, MIT — the same family the
// rareicon codegen pulls from). Inlined as components so they inherit
// currentColor and need no external fetch under the Discord asset proxy.

function Icon({
	size = 14,
	style,
	children,
}: {
	size?: number;
	style?: CSSProperties;
	children: React.ReactNode;
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			style={style}
			aria-hidden="true">
			{children}
		</svg>
	);
}

/** Chevron that points right; rotate 90° via `open` to point down. */
export function ChevronIcon({
	size = 14,
	open = false,
	style,
}: {
	size?: number;
	open?: boolean;
	style?: CSSProperties;
}) {
	return (
		<Icon
			size={size}
			style={{
				transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
				transition: 'transform 0.18s ease',
				...style,
			}}>
			<path d="M9 6l6 6-6 6" />
		</Icon>
	);
}

export function ChatIcon({
	size = 14,
	style,
}: {
	size?: number;
	style?: CSSProperties;
}) {
	return (
		<Icon size={size} style={style}>
			<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
		</Icon>
	);
}

export function TipsIcon({
	size = 14,
	style,
}: {
	size?: number;
	style?: CSSProperties;
}) {
	return (
		<Icon size={size} style={style}>
			<path d="M15 14c.2-1 .7-1.7 1.5-2.5A5.5 5.5 0 1 0 8 8c0 1 .2 2.2 1.5 3.5.8.8 1.3 1.5 1.5 2.5" />
			<path d="M9 18h6" />
			<path d="M10 22h4" />
		</Icon>
	);
}

export function NewsIcon({
	size = 14,
	style,
}: {
	size?: number;
	style?: CSSProperties;
}) {
	return (
		<Icon size={size} style={style}>
			<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
			<path d="M18 14h-8M15 18h-5M10 6h8v4h-8z" />
		</Icon>
	);
}
