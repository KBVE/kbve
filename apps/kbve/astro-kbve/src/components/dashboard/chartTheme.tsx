import type { ComponentProps } from 'react';
import { Tooltip } from 'recharts';

export const POLL_MS = 30_000;

export const AXIS_STROKE = 'var(--sl-color-gray-3, #8b949e)';
export const GRID_STROKE = 'var(--sl-color-gray-5, #262626)';

export const tooltipStyle = {
	background: 'var(--sl-color-bg-nav, #111)',
	border: '1px solid var(--sl-color-gray-5, #262626)',
	borderRadius: '8px',
	fontSize: '0.75rem',
	color: 'var(--sl-color-text, #e6edf3)',
} as const;

/* Recharts colors tooltip rows from each series' `color`; cells filled via CSS
   class carry none, so rows fall back to recharts' near-black default. Pin
   item and label text to the theme text color. */
const tooltipTextStyle = {
	color: 'var(--sl-color-text, #e6edf3)',
} as const;

export function ChartTooltip(props: ComponentProps<typeof Tooltip>) {
	return (
		<Tooltip
			contentStyle={tooltipStyle}
			itemStyle={tooltipTextStyle}
			labelStyle={tooltipTextStyle}
			{...props}
		/>
	);
}
