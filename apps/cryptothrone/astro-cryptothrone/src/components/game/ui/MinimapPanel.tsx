import { useEffect, useState } from 'react';
import { laserEvents } from '@kbve/laser';
import { Minimap } from './Minimap';
import { PixelPanel } from './PixelPanel';

export function MinimapPanel() {
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
		<PixelPanel
			variant="stone"
			scale={2}
			className="pointer-events-none flex flex-col gap-1 p-1">
			<Minimap
				size={120}
				className="mx-auto block rounded-sm bg-black/50"
			/>
			<div className="flex items-center justify-between gap-2 font-mono text-[0.6rem] leading-none">
				<span className="truncate text-amber-300">{zone}</span>
				<span className="text-stone-300">
					{pos.x},{pos.y}
				</span>
			</div>
			<div className="text-right font-mono text-[0.55rem] leading-none text-stone-500">
				{fps} fps · {clock}
			</div>
		</PixelPanel>
	);
}
