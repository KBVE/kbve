import { useId, useState } from 'react';

// Smooth (Catmull-Rom -> bezier) area chart with right-side y ticks, x labels,
// and a hover scrubber + tooltip. Inline SVG, no chart dep. Gold theme.
export function AreaChart({
	data,
	labels,
	height = 240,
	stroke = '#c9a56a',
	unit = '',
}: {
	data: number[];
	labels?: string[];
	height?: number;
	stroke?: string;
	unit?: string;
}) {
	const gid = useId().replace(/:/g, '');
	const [hover, setHover] = useState<number | null>(null);
	const W = 1000;
	const H = height;
	const padX = 12;
	const padTop = 16;
	const padBot = 28;
	if (data.length < 2) return null;

	const min = Math.min(...data);
	const max = Math.max(...data);
	const span = max - min || 1;
	const stepX = (W - padX * 2) / (data.length - 1);
	const X = (i: number) => padX + i * stepX;
	const Y = (v: number) =>
		padTop + (H - padTop - padBot) * (1 - (v - min) / span);
	const pts = data.map((v, i) => [X(i), Y(v)] as const);

	// Catmull-Rom -> cubic bezier
	let path = `M ${pts[0][0]},${pts[0][1]}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[i - 1] ?? pts[i];
		const p1 = pts[i];
		const p2 = pts[i + 1];
		const p3 = pts[i + 2] ?? p2;
		const c1x = p1[0] + (p2[0] - p0[0]) / 6;
		const c1y = p1[1] + (p2[1] - p0[1]) / 6;
		const c2x = p2[0] - (p3[0] - p1[0]) / 6;
		const c2y = p2[1] - (p3[1] - p1[1]) / 6;
		path += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
	}
	const area = `${path} L ${pts[pts.length - 1][0]},${H - padBot} L ${pts[0][0]},${H - padBot} Z`;

	const ticks = 4;
	const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
		const v = min + (span * i) / ticks;
		return { v, y: Y(v) };
	});

	const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const x = ((e.clientX - rect.left) / rect.width) * W;
		const i = Math.round((x - padX) / stepX);
		setHover(Math.max(0, Math.min(data.length - 1, i)));
	};

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			width="100%"
			height={H}
			preserveAspectRatio="none"
			onMouseMove={onMove}
			onMouseLeave={() => setHover(null)}
			style={{ display: 'block', cursor: 'crosshair' }}>
			<defs>
				<linearGradient id={`fill${gid}`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
					<stop offset="100%" stopColor={stroke} stopOpacity="0" />
				</linearGradient>
			</defs>

			{yTicks.map((t, i) => (
				<line
					key={i}
					x1={padX}
					y1={t.y}
					x2={W - padX}
					y2={t.y}
					stroke="rgba(245,236,216,0.06)"
					strokeWidth={1}
				/>
			))}

			<path d={area} fill={`url(#fill${gid})`} />
			<path
				d={path}
				fill="none"
				stroke={stroke}
				strokeWidth={2.5}
				strokeLinejoin="round"
				strokeLinecap="round"
			/>

			{hover !== null ? (
				<g>
					<line
						x1={X(hover)}
						y1={padTop}
						x2={X(hover)}
						y2={H - padBot}
						stroke="rgba(245,236,216,0.25)"
						strokeWidth={1}
					/>
					<circle
						cx={X(hover)}
						cy={Y(data[hover])}
						r={5}
						fill={stroke}
						stroke="#161310"
						strokeWidth={2}
					/>
					<text
						x={Math.min(X(hover) + 10, W - 70)}
						y={Y(data[hover]) - 10}
						fill="#f5ecd8"
						fontSize={22}
						fontWeight={700}>
						{data[hover].toFixed(1)}
						{unit}
					</text>
				</g>
			) : null}

			{labels?.map((l, i) =>
				i % Math.ceil(labels.length / 6) === 0 ? (
					<text
						key={l + i}
						x={X(i)}
						y={H - 8}
						fill="#7d705a"
						fontSize={18}
						textAnchor="middle">
						{l}
					</text>
				) : null,
			)}
		</svg>
	);
}
