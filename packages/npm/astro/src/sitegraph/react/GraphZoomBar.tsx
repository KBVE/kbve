import { memo } from 'react';
import { MIN_ZOOM, MAX_ZOOM } from './graph-core';

interface GraphZoomBarProps {
	zoom: number;
	onReset: () => void;
	onSliderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/** Bottom zoom bar: reset-to-100% button + zoom slider. */
export const GraphZoomBar = memo(function GraphZoomBar({
	zoom,
	onReset,
	onSliderChange,
}: GraphZoomBarProps) {
	const pct = ((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100;
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: '6px',
				padding: '6px 8px 0',
			}}>
			<button
				onClick={onReset}
				title="Reset zoom"
				style={{
					background: 'none',
					border: 'none',
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontSize: '10px',
					fontWeight: 600,
					cursor: 'pointer',
					padding: '2px 4px',
					borderRadius: 4,
					lineHeight: 1,
					fontVariantNumeric: 'tabular-nums',
					minWidth: '32px',
					textAlign: 'center',
				}}>
				{Math.round(zoom * 100)}%
			</button>
			<input
				type="range"
				min={MIN_ZOOM}
				max={MAX_ZOOM}
				step={0.05}
				value={zoom}
				onChange={onSliderChange}
				title={`Zoom: ${Math.round(zoom * 100)}%`}
				aria-label="Zoom level"
				aria-valuetext={`${Math.round(zoom * 100)}%`}
				style={{
					flex: 1,
					height: '3px',
					appearance: 'none',
					WebkitAppearance: 'none',
					background: `linear-gradient(to right, var(--sl-color-accent, #06b6d4) 0%, var(--sl-color-accent, #06b6d4) ${pct}%, var(--sl-color-gray-5, #262626) ${pct}%, var(--sl-color-gray-5, #262626) 100%)`,
					borderRadius: '2px',
					cursor: 'pointer',
				}}
			/>
		</div>
	);
});
