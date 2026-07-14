import type { CSSProperties, ReactNode } from 'react';
import { gradients, ui, type GradientName } from './gradients';

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
				background: gradient ? gradients[gradient] : ui.surface,
				border: `1px solid ${ui.border}`,
				boxShadow: glow
					? '0 14px 44px rgba(0,0,0,0.5), 0 0 0 1px rgba(167,139,250,0.14)'
					: '0 8px 24px rgba(0,0,0,0.4)',
				boxSizing: 'border-box',
				...style,
			}}>
			{children}
		</div>
	);
}
