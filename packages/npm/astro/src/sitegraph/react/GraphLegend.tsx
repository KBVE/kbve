import { memo } from 'react';

interface GraphLegendProps {
	distinctTags: string[];
	distinctRelationships: string[];
	tagStyles?: Record<string, { fill: string; stroke: string; radius: number }>;
	tagLabels?: Record<string, string>;
	edgeColors?: Record<string, string>;
	edgeDashes?: Record<string, string>;
	edgeLabels?: Record<string, string>;
}

/** Cluster legend: tag swatches + relationship line styles below the SVG. */
export const GraphLegend = memo(function GraphLegend({
	distinctTags,
	distinctRelationships,
	tagStyles,
	tagLabels,
	edgeColors,
	edgeDashes,
	edgeLabels,
}: GraphLegendProps) {
	if (distinctTags.length < 2 && distinctRelationships.length === 0)
		return null;

	return (
		<ul
			className="sg-legend"
			aria-label="Graph legend"
			style={{
				listStyle: 'none',
				margin: '6px 0 0',
				padding: '0 8px',
				display: 'flex',
				flexWrap: 'wrap',
				gap: '4px 10px',
				fontSize: '10px',
				color: 'var(--sl-color-gray-3, #8b949e)',
			}}>
			{distinctTags.length >= 2 &&
				distinctTags.map((tag) => {
					const style = tagStyles?.[tag];
					return (
						<li
							key={`tag-${tag}`}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: '4px',
							}}>
							<span
								style={{
									width: 8,
									height: 8,
									borderRadius: '50%',
									background:
										style?.fill ?? 'var(--sl-color-white)',
									border: `1px solid ${style?.stroke ?? 'var(--sl-color-gray-4)'}`,
									display: 'inline-block',
								}}
								aria-hidden="true"
							/>
							{tagLabels?.[tag] ?? tag}
						</li>
					);
				})}
			{distinctRelationships.map((rel) => {
				const dash = edgeDashes?.[rel];
				const stroke = edgeColors?.[rel] ?? 'var(--sl-color-gray-4)';
				return (
					<li
						key={`rel-${rel}`}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: '4px',
						}}>
						<svg width={16} height={6} aria-hidden="true">
							<line
								x1={0}
								y1={3}
								x2={16}
								y2={3}
								stroke={stroke}
								strokeWidth={1.5}
								strokeDasharray={dash}
							/>
						</svg>
						{edgeLabels?.[rel] ?? rel}
					</li>
				);
			})}
		</ul>
	);
});
