import { useEffect, useRef, useState } from 'react';
import { laserEvents } from '@kbve/laser';

const TOWN = { x: 5, y: 12 };

export function Compass() {
	const [deg, setDeg] = useState(0);
	const me = useRef({ x: 5, y: 12 });
	useEffect(() => {
		return laserEvents.on('player:position', (d) => {
			me.current = d as { x: number; y: number };
			const dx = TOWN.x - me.current.x;
			const dy = TOWN.y - me.current.y;
			setDeg((Math.atan2(dy, dx) * 180) / Math.PI + 90);
		});
	}, []);
	const inTown =
		Math.abs(me.current.x - TOWN.x) <= 8 &&
		Math.abs(me.current.y - TOWN.y) <= 8;
	return (
		<div className="pointer-events-none absolute right-3 top-52 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/55 backdrop-blur-md">
			{inTown ? (
				<span className="text-[0.6rem] text-amber-300">⌂</span>
			) : (
				<span
					className="text-amber-300"
					style={{ transform: `rotate(${deg}deg)` }}>
					↑
				</span>
			)}
		</div>
	);
}
