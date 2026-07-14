import { useId } from 'react';

// Simple rounded bar chart (SVG). Gold theme; the tallest bar is accented.
export function Bars({
	data,
	labels,
	height = 110,
}: {
	data: number[];
	labels?: string[];
	height?: number;
}) {
	const gid = useId().replace(/:/g, '');
	if (data.length === 0) return null;
	const W = 320;
	const H = height;
	const padBot = labels ? 18 : 6;
	const max = Math.max(...data) || 1;
	const peak = data.indexOf(max);
	const slot = W / data.length;
	const bw = Math.min(18, slot * 0.5);

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			width="100%"
			height={H}
			preserveAspectRatio="none"
			style={{ display: 'block' }}>
			<defs>
				<linearGradient id={`bar${gid}`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#e879f9" />
					<stop offset="100%" stopColor="#a78bfa" />
				</linearGradient>
			</defs>
			{data.map((v, i) => {
				const h = ((H - padBot - 6) * v) / max;
				const x = i * slot + (slot - bw) / 2;
				const y = H - padBot - h;
				return (
					<g key={i}>
						<rect
							x={x}
							y={y}
							width={bw}
							height={h}
							rx={bw / 2}
							fill={
								i === peak
									? `url(#bar${gid})`
									: 'rgba(167,139,250,0.25)'
							}
						/>
						{labels?.[i] ? (
							<text
								x={x + bw / 2}
								y={H - 4}
								fill="#7d705a"
								fontSize={11}
								textAnchor="middle">
								{labels[i]}
							</text>
						) : null}
					</g>
				);
			})}
		</svg>
	);
}
