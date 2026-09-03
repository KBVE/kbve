import { useEffect, useState } from 'react';
import { laserEvents } from '@kbve/laser';

type Rgba = [number, number, number, number];
type Stop = [number, Rgba];

const STOPS: Stop[] = [
	[0.0, [10, 14, 40, 0.45]],
	[0.1, [10, 14, 40, 0.45]],
	[0.16, [255, 150, 80, 0.18]],
	[0.24, [0, 0, 0, 0]],
	[0.7, [0, 0, 0, 0]],
	[0.8, [255, 120, 60, 0.2]],
	[0.88, [20, 20, 60, 0.3]],
	[0.94, [10, 14, 40, 0.45]],
	[1.0, [10, 14, 40, 0.45]],
];

function tint(phase: number): string {
	const p = ((phase % 1) + 1) % 1;
	let lo = STOPS[0];
	let hi = STOPS[STOPS.length - 1];
	for (let i = 0; i < STOPS.length - 1; i++) {
		if (p >= STOPS[i][0] && p <= STOPS[i + 1][0]) {
			lo = STOPS[i];
			hi = STOPS[i + 1];
			break;
		}
	}
	const span = hi[0] - lo[0];
	const t = span > 0 ? (p - lo[0]) / span : 0;
	const e = t * t * (3 - 2 * t);
	const c = lo[1].map((v, i) => v + (hi[1][i] - v) * e);
	return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${c[3].toFixed(3)})`;
}

export function DayNight() {
	const [color, setColor] = useState('rgba(0,0,0,0)');
	useEffect(() => {
		return laserEvents.on('world:time', (d) => {
			setColor(tint((d as { phase: number }).phase));
		});
	}, []);
	return (
		<div
			className="pointer-events-none absolute inset-0 z-10 transition-colors duration-1000"
			style={{ backgroundColor: color }}
			aria-hidden="true"
		/>
	);
}
