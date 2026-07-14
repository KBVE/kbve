import { useEffect, useRef } from 'react';
import { laserEvents } from '@kbve/laser';

const MAP_W = 50;
const MAP_H = 50;
const DEFAULT_SIZE = 120;

interface MinimapProps {
	size?: number;
	className?: string;
}

export function Minimap({ size = DEFAULT_SIZE, className }: MinimapProps = {}) {
	const ref = useRef<HTMLCanvasElement>(null);
	const me = useRef({ x: 5, y: 12 });
	const others = useRef<{ x: number; y: number }[]>([]);

	useEffect(() => {
		const draw = () => {
			const cv = ref.current;
			if (!cv) return;
			const ctx = cv.getContext('2d');
			if (!ctx) return;
			ctx.clearRect(0, 0, size, size);
			ctx.fillStyle = 'rgba(20,20,30,0.7)';
			ctx.fillRect(0, 0, size, size);
			const sx = size / MAP_W;
			const sy = size / MAP_H;
			ctx.fillStyle = '#34d399';
			for (const o of others.current)
				ctx.fillRect(o.x * sx - 1, o.y * sy - 1, 3, 3);
			ctx.fillStyle = '#fbbf24';
			ctx.fillRect(me.current.x * sx - 2, me.current.y * sy - 2, 4, 4);
		};
		const offs = [
			laserEvents.on('player:position', (d) => {
				me.current = d as { x: number; y: number };
				draw();
			}),
			laserEvents.on('world:players', (d) => {
				others.current = (
					d as { players: { x: number; y: number }[] }
				).players;
				draw();
			}),
		];
		draw();
		return () => offs.forEach((o) => o());
	}, [size]);

	return (
		<canvas
			ref={ref}
			width={size}
			height={size}
			className={
				className ??
				'rounded-lg border border-white/10 bg-black/50 backdrop-blur-md'
			}
		/>
	);
}
