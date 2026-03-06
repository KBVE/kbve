import { useState, type ReactNode, type CSSProperties } from 'react';
import { useSpring, animated } from 'react-spring';

interface ExpandButtonProps {
	/** Icon element shown in both collapsed and expanded state */
	icon: ReactNode;
	/** Text label revealed on hover */
	label: string;
	/** Optional secondary text (e.g. vote count) always visible below icon */
	badge?: string;
	/** Click handler (button mode) */
	onClick?: () => void;
	/** Link href (anchor mode — renders <a> instead of <button>) */
	href?: string;
	target?: string;
	rel?: string;
	disabled?: boolean;
	ariaLabel?: string;
	/** Accent color for hover state */
	accentColor?: string;
	/** Additional style overrides for the outer element */
	style?: CSSProperties;
}

const slVar = (name: string, fallback: string) =>
	`var(--sl-color-${name}, ${fallback})`;

export function ExpandButton({
	icon,
	label,
	badge,
	onClick,
	href,
	target,
	rel,
	disabled = false,
	ariaLabel,
	accentColor = slVar('accent', '#8b5cf6'),
	style,
}: ExpandButtonProps) {
	const [hovered, setHovered] = useState(false);

	// Spring for expanding the label width
	const expand = useSpring({
		maxWidth: hovered ? 120 : 0,
		opacity: hovered ? 1 : 0,
		config: { tension: 260, friction: 24 },
	});

	// Spring for the shine sweep
	const shine = useSpring({
		x: hovered ? 200 : -100,
		config: { tension: 180, friction: 28 },
	});

	// Spring for background + border transitions
	const bg = useSpring({
		borderColor: hovered ? accentColor : slVar('gray-5', '#374151'),
		backgroundColor: hovered
			? slVar('accent-low', '#1e1033')
			: 'transparent',
		config: { tension: 200, friction: 26 },
	});

	const baseStyle: CSSProperties = {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: '0.25rem',
		padding: '0.375rem 0.5rem',
		borderRadius: '0.5rem',
		borderWidth: 1,
		borderStyle: 'solid',
		color: hovered ? accentColor : slVar('gray-3', '#9ca3af'),
		cursor: disabled ? 'default' : 'pointer',
		opacity: disabled ? 0.6 : 1,
		position: 'relative',
		overflow: 'hidden',
		fontSize: '0.75rem',
		fontWeight: 600,
		lineHeight: 1,
		textDecoration: 'none',
		transition: 'color 0.15s',
		...style,
	};

	const inner = (
		<>
			{/* Shine sweep overlay */}
			<animated.span
				aria-hidden
				style={{
					position: 'absolute',
					top: '-50%',
					right: 0,
					width: '0.5rem',
					height: '200%',
					background: 'rgba(255,255,255,0.10)',
					transform: shine.x.to(
						(v) => `translateX(${v}%) rotate(12deg)`,
					),
					pointerEvents: 'none',
				}}
			/>
			{/* Icon (always visible) */}
			{icon}
			{/* Expanding label */}
			<animated.span
				style={{
					display: 'inline-block',
					maxWidth: expand.maxWidth,
					opacity: expand.opacity,
					overflow: 'hidden',
					whiteSpace: 'nowrap',
				}}>
				{label}
			</animated.span>
			{/* Optional always-visible badge (e.g. vote count) */}
			{badge != null && <span>{badge}</span>}
		</>
	);

	const handlers = {
		onMouseEnter: () => !disabled && setHovered(true),
		onMouseLeave: () => setHovered(false),
	};

	if (href) {
		return (
			<animated.a
				href={href}
				target={target}
				rel={rel}
				aria-label={ariaLabel}
				style={{
					...baseStyle,
					borderColor: bg.borderColor,
					backgroundColor: bg.backgroundColor,
				}}
				{...handlers}>
				{inner}
			</animated.a>
		);
	}

	return (
		<animated.button
			onClick={onClick}
			disabled={disabled}
			aria-label={ariaLabel}
			style={{
				...baseStyle,
				borderColor: bg.borderColor,
				backgroundColor: bg.backgroundColor,
			}}
			{...handlers}>
			{inner}
		</animated.button>
	);
}
