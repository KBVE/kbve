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
