import { useEffect, useRef } from 'react';
import type { HudMap } from '../../systems/hud';

const MINIMAP_PX = 168;
const FLOOR_COLOR = '#5a6c8c';
const ROOM_GLOW = '#7e93b8';

/**
 * D2-style translucent minimap overlay: the floor bitset painted as lit cells
 * over a faint void, player pinned center with a heading wedge. No solid panel
 * frame — a soft rounded glass plate so the scene reads through it.
 */
export function Minimap({
	map,
	tile,
	headingDeg,
}: {
	map: HudMap;
	tile: { x: number; y: number };
	headingDeg: number;
}) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const { size, cells, origin } = map;
		const cell = MINIMAP_PX / size;

		ctx.clearRect(0, 0, MINIMAP_PX, MINIMAP_PX);

		ctx.fillStyle = FLOOR_COLOR;
		for (let j = 0; j < size; j++) {
			for (let i = 0; i < size; i++) {
				if (!cells[j * size + i]) continue;
				ctx.fillRect(
					Math.floor(i * cell),
					Math.floor(j * cell),
					Math.ceil(cell),
					Math.ceil(cell),
				);
			}
		}

		const pcx = (tile.x - origin.x + 0.5) * cell;
		const pcy = (tile.y - origin.y + 0.5) * cell;

		ctx.save();
		ctx.translate(pcx, pcy);
		ctx.rotate(((headingDeg - 90) * Math.PI) / 180);
		ctx.fillStyle = ROOM_GLOW;
		ctx.beginPath();
		ctx.moveTo(8, 0);
		ctx.lineTo(-5, -5);
		ctx.lineTo(-5, 5);
		ctx.closePath();
		ctx.fill();
		ctx.restore();

		ctx.fillStyle = '#fcd34d';
		ctx.beginPath();
		ctx.arc(pcx, pcy, 3, 0, Math.PI * 2);
		ctx.fill();
	}, [map, tile.x, tile.y, headingDeg]);

	return (
		<div
			style={{
				width: MINIMAP_PX,
				height: MINIMAP_PX,
				borderRadius: '50%',
				overflow: 'hidden',
				background: 'rgba(10,13,20,0.32)',
				boxShadow:
					'inset 0 0 0 2px rgba(180,200,230,0.28), 0 2px 10px rgba(0,0,0,0.5)',
				backdropFilter: 'blur(1px)',
			}}>
			<canvas
				ref={ref}
				width={MINIMAP_PX}
				height={MINIMAP_PX}
				style={{
					display: 'block',
					imageRendering: 'pixelated',
					opacity: 0.92,
				}}
			/>
		</div>
	);
}
