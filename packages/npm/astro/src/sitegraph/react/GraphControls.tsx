import { memo, type RefObject } from 'react';

interface GraphControlsProps {
	depth: number;
	onDepthChange: (depth: number) => void;
	minDepth: number;
	maxDepth: number;
	search: string;
	onSearchChange: (q: string) => void;
	searchInputRef: RefObject<HTMLInputElement | null>;
	isFullscreen: boolean;
	onFullscreenChange?: (next: boolean) => void;
}

/** Top control bar: neighborhood depth, title filter, fullscreen toggle. */
export const GraphControls = memo(function GraphControls({
	depth,
	onDepthChange,
	minDepth,
	maxDepth,
	search,
	onSearchChange,
	searchInputRef,
	isFullscreen,
	onFullscreenChange,
}: GraphControlsProps) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: '6px',
				padding: '0 8px 6px',
				fontSize: '11px',
				color: 'var(--sl-color-gray-3, #8b949e)',
			}}>
			<label
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: '4px',
				}}>
				Depth
				<select
					value={depth}
					onChange={(e) => onDepthChange(Number(e.target.value))}
					style={{
						background: 'var(--sl-color-bg-nav)',
						color: 'inherit',
						border: '1px solid var(--sl-color-gray-5, #262626)',
						borderRadius: 4,
						padding: '1px 4px',
						fontSize: '11px',
					}}>
					{Array.from(
						{ length: maxDepth - minDepth + 1 },
						(_, i) => minDepth + i,
					).map((d) => (
						<option key={d} value={d}>
							{d}
						</option>
					))}
				</select>
			</label>
			<input
				ref={searchInputRef}
				type="search"
				value={search}
				onChange={(e) => onSearchChange(e.target.value)}
				placeholder="Filter…  (/)"
				aria-label="Filter nodes by title (press / to focus)"
				style={{
					flex: 1,
					minWidth: 0,
					background: 'var(--sl-color-bg-nav)',
					color: 'inherit',
					border: '1px solid var(--sl-color-gray-5, #262626)',
					borderRadius: 4,
					padding: '2px 6px',
					fontSize: '11px',
				}}
			/>
			{onFullscreenChange && (
				<button
					onClick={() => onFullscreenChange(!isFullscreen)}
					title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
					aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
					style={{
						background: 'none',
						border: '1px solid var(--sl-color-gray-5, #262626)',
						color: 'inherit',
						borderRadius: 4,
						padding: '1px 6px',
						fontSize: '11px',
						cursor: 'pointer',
					}}>
					{isFullscreen ? '×' : '⤢'}
				</button>
			)}
		</div>
	);
});
