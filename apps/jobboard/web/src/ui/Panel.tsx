import type { CSSProperties, ReactNode } from 'react';
import { gradients, type GradientName } from './gradients';

// Web card surface: real CSS gradient, generous radius, hairline border + soft
// shadow for depth. Children are @kbve/rn (react-native-web) nodes; they render
// fine inside this DOM element. Use instead of the banded RN Gradient on web.
export function Panel({
	gradient,
	radius = 20,
	pad = 20,
	glow = false,
	style,
	children,
}: {
	gradient?: GradientName;
	radius?: number;
	pad?: number;
	glow?: boolean;
	style?: CSSProperties;
	children?: ReactNode;
}) {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				borderRadius: radius,
				padding: pad,
				background: gradient ? gradients[gradient] : '#1b1814',
				border: '1px solid rgba(245,236,216,0.08)',
				boxShadow: glow
					? '0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(201,165,106,0.12)'
					: '0 8px 24px rgba(0,0,0,0.35)',
				boxSizing: 'border-box',
				...style,
			}}>
			{children}
		</div>
	);
}
