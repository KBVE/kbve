const SIZE = 18;
const STROKE = 1.5;

interface IconProps {
	size?: number;
	className?: string;
}

function I({
	size = SIZE,
	className,
	children,
}: IconProps & { children: React.ReactNode }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}>
			{children}
		</svg>
	);
}

export function IconSettings(p: IconProps) {
	return (
		<I {...p}>
			<circle cx="12" cy="12" r="3" />
			<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
		</I>
	);
}

export function IconMic(p: IconProps) {
	return (
		<I {...p}>
			<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
			<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
			<line x1="12" y1="19" x2="12" y2="23" />
			<line x1="8" y1="23" x2="16" y2="23" />
		</I>
	);
}

export function IconCpu(p: IconProps) {
	return (
		<I {...p}>
			<rect x="4" y="4" width="16" height="16" rx="2" />
			<rect x="9" y="9" width="6" height="6" />
			<line x1="9" y1="1" x2="9" y2="4" />
			<line x1="15" y1="1" x2="15" y2="4" />
			<line x1="9" y1="20" x2="9" y2="23" />
			<line x1="15" y1="20" x2="15" y2="23" />
			<line x1="20" y1="9" x2="23" y2="9" />
			<line x1="20" y1="14" x2="23" y2="14" />
			<line x1="1" y1="9" x2="4" y2="9" />
			<line x1="1" y1="14" x2="4" y2="14" />
		</I>
	);
}

export function IconKeyboard(p: IconProps) {
	return (
		<I {...p}>
			<rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
			<line x1="6" y1="8" x2="6" y2="8" />
			<line x1="10" y1="8" x2="10" y2="8" />
			<line x1="14" y1="8" x2="14" y2="8" />
			<line x1="18" y1="8" x2="18" y2="8" />
			<line x1="6" y1="12" x2="6" y2="12" />
			<line x1="10" y1="12" x2="10" y2="12" />
			<line x1="14" y1="12" x2="14" y2="12" />
			<line x1="18" y1="12" x2="18" y2="12" />
			<line x1="8" y1="16" x2="16" y2="16" />
		</I>
	);
}

export function IconInfo(p: IconProps) {
	return (
		<I {...p}>
			<circle cx="12" cy="12" r="10" />
			<line x1="12" y1="16" x2="12" y2="12" />
			<line x1="12" y1="8" x2="12.01" y2="8" />
		</I>
	);
}

export function IconTerminal(p: IconProps) {
	return (
		<I {...p}>
			<rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
			<polyline points="6 9 10 12 6 15" />
			<line x1="12" y1="15" x2="16" y2="15" />
		</I>
	);
}

export function IconUser(p: IconProps) {
	return (
		<I {...p}>
			<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
			<circle cx="12" cy="7" r="4" />
		</I>
	);
}

export function IconGitHub(p: IconProps) {
	return (
		<I {...p}>
			<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
		</I>
	);
}

export function IconDiscord(p: IconProps) {
	return (
		<I {...p}>
			<path d="M8.5 17c-2 0-3.5-1-4.5-2 .3-2.5 1-5 2.2-7.3C7.3 6.6 8.6 6.2 10 6l.5 1.2a11 11 0 0 1 3 0L14 6c1.4.2 2.7.6 3.8 1.7A20 20 0 0 1 20 15c-1 1-2.5 2-4.5 2l-.9-1.4c-1.7.5-3.5.5-5.2 0z" />
			<circle cx="9.5" cy="12.5" r="0.5" />
			<circle cx="14.5" cy="12.5" r="0.5" />
		</I>
	);
}

export function IconLogOut(p: IconProps) {
	return (
		<I {...p}>
			<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
			<polyline points="16 17 21 12 16 7" />
			<line x1="21" y1="12" x2="9" y2="12" />
		</I>
	);
}
