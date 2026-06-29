import { memo, type RefObject } from 'react';

interface GraphTooltipProps {
	tooltipRef: RefObject<HTMLDivElement | null>;
}

/**
 * Floating node tooltip. Content + position are written imperatively (see
 * `showTooltip`/`moveTooltip` in SiteGraph) so it never re-renders on hover.
 */
export const GraphTooltip = memo(function GraphTooltip({
	tooltipRef,
}: GraphTooltipProps) {
	return (
		<div
			ref={tooltipRef}
			role="tooltip"
			aria-hidden="true"
			style={{
				position: 'absolute',
				transform: 'translate(-50%, -100%) translateY(-12px)',
				pointerEvents: 'none',
				zIndex: 10,
				background: 'var(--sl-color-gray-6, #1a1a1a)',
				border: '1px solid var(--sl-color-gray-5, #262626)',
				borderRadius: 6,
				padding: '5px 8px',
				whiteSpace: 'nowrap',
				boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
				opacity: 0,
				visibility: 'hidden',
				transition: 'opacity 0.1s ease',
				top: 0,
				left: 0,
			}}>
			<div
				data-sg-tip-title
				style={{
					fontSize: '10px',
					fontWeight: 600,
					color: 'var(--sl-color-white, #e6edf3)',
					lineHeight: 1.3,
				}}
			/>
			<div
				data-sg-tip-path
				style={{
					fontSize: '8.5px',
					color: 'var(--sl-color-gray-3, #8b949e)',
					lineHeight: 1.3,
				}}
			/>
		</div>
	);
});
