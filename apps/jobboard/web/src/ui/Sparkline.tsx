// Lightweight inline-SVG area/line chart for the web dashboard (no chart dep).
export function Sparkline({
	data,
	width = 600,
	height = 160,
	stroke = '#60a5fa',
	fill = 'rgba(96,165,250,0.18)',
	strokeWidth = 2,
}: {
	data: number[];
	width?: number;
	height?: number;
	stroke?: string;
	fill?: string;
	strokeWidth?: number;
}) {
	if (data.length < 2) return null;
	const min = Math.min(...data);
	const max = Math.max(...data);
	const span = max - min || 1;
	const pad = strokeWidth + 1;
	const stepX = (width - pad * 2) / (data.length - 1);
	const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / span);
	const pts = data.map((v, i) => [pad + i * stepX, y(v)] as const);

	// smooth-ish line via simple segments
	const line = pts.map(([px, py]) => `${px},${py}`).join(' ');
	const area = `M ${pts[0][0]},${height} L ${line.replace(/ /g, ' L ')} L ${
		pts[pts.length - 1][0]
	},${height} Z`;

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="none"
			width="100%"
			height={height}
			style={{ display: 'block' }}>
			<path d={area} fill={fill} />
			<polyline
				points={line}
				fill="none"
				stroke={stroke}
				strokeWidth={strokeWidth}
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
		</svg>
	);
}
