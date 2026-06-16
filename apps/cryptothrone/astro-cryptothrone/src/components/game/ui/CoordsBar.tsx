import { useEffect, useState } from 'react';
import { laserEvents } from '@kbve/laser';

export function CoordsBar() {
	const [pos, setPos] = useState({ x: 0, y: 0 });
	const [fps, setFps] = useState(0);
	const [zone, setZone] = useState('—');
	const [clock, setClock] = useState('--:--');

	useEffect(() => {
		const offs = [
			laserEvents.on('player:position', (d) =>
				setPos(d as { x: number; y: number }),
			),
			laserEvents.on('perf:fps', (d) =>
				setFps((d as { fps: number }).fps),
			),
			laserEvents.on('zone:enter', (d) =>
				setZone((d as { name: string }).name),
			),
			laserEvents.on('world:time', (d) => {
				const phase = (((d as { phase: number }).phase % 1) + 1) % 1;
				const mins = Math.floor(phase * 24 * 60);
				const hh = String(Math.floor(mins / 60)).padStart(2, '0');
				const mm = String(mins % 60).padStart(2, '0');
				setClock(`${hh}:${mm}`);
			}),
		];
		return () => offs.forEach((o) => o());
	}, []);

	return (
		<div className="pointer-events-none absolute right-3 top-16 z-30 rounded-lg border border-white/10 bg-black/55 px-3 py-1.5 text-right font-mono text-[0.65rem] leading-relaxed text-stone-300 backdrop-blur-md">
			<div className="text-amber-300">{zone}</div>
			<div>
				{pos.x},{pos.y}
			</div>
			<div className="text-stone-500">
				{fps} fps · {clock}
			</div>
		</div>
	);
}
