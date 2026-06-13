import { useEffect, useState } from 'react';
import { laserEvents } from '@kbve/laser';

export function CoordsBar() {
	const [pos, setPos] = useState({ x: 0, y: 0 });
	const [fps, setFps] = useState(0);
	const [zone, setZone] = useState('—');
	const [clock, setClock] = useState('');

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
		];
		const t = window.setInterval(
			() =>
				setClock(
					new Date().toLocaleTimeString(undefined, {
						hour: '2-digit',
						minute: '2-digit',
					}),
				),
			1000,
		);
		return () => {
			offs.forEach((o) => o());
			window.clearInterval(t);
		};
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
