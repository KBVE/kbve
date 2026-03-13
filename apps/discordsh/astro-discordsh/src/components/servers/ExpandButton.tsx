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
	/** Additional style overrides for the outer element */
	style?: CSSProperties;
}

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
		borderColor: hovered
			? 'var(--sl-color-accent, #8b5cf6)'
			: 'var(--sl-color-gray-5, #374151)',
		backgroundColor: hovered
			? 'var(--sl-color-accent-low, #1e1033)'
			: 'transparent',
		config: { tension: 200, friction: 26 },
	});

	const colorStyle: CSSProperties = {
		color: hovered
			? 'var(--sl-color-accent, #8b5cf6)'
			: 'var(--sl-color-gray-3, #9ca3af)',
		opacity: disabled ? 0.6 : 1,
		cursor: disabled ? 'default' : 'pointer',
		...style,
	};

	const inner = (
		<>
			{/* Shine sweep overlay */}
			<animated.span
				aria-hidden
				className="eb-shine"
				style={{
					transform: shine.x.to(
						(v) => `translateX(${v}%) rotate(12deg)`,
					),
				}}
			/>
			{/* Icon (always visible) */}
			{icon}
			{/* Expanding label */}
			<animated.span
				className="inline-block overflow-hidden whitespace-nowrap"
				style={{
					maxWidth: expand.maxWidth,
					opacity: expand.opacity,
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
				className="eb-base"
				style={{
					...colorStyle,
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
			className="eb-base"
			style={{
				...colorStyle,
				borderColor: bg.borderColor,
				backgroundColor: bg.backgroundColor,
			}}
			{...handlers}>
			{inner}
		</animated.button>
	);
}
