import { useEffect, useRef, useState } from 'react';
import { laserEvents } from '@kbve/laser';
import { useGameDispatch } from '../store/GameStoreContext';

interface Toast {
	id: number;
	title: string;
}
let counter = 0;

export function Achievements() {
	const dispatch = useGameDispatch();
	const [toasts, setToasts] = useState<Toast[]>([]);
	const unlocked = useRef(new Set<string>());

	useEffect(() => {
		const grant = (key: string, title: string) => {
			if (unlocked.current.has(key)) return;
			unlocked.current.add(key);
			setToasts((p) => [...p, { id: ++counter, title }]);
			setTimeout(
				() => setToasts((p) => p.filter((t) => t.title !== title)),
				4000,
			);
			dispatch({
				type: 'ADD_NOTIFICATION',
				payload: {
					title: 'Achievement',
					message: title,
					type: 'success',
				},
			});
		};
		const offs = [
			laserEvents.on('combat:event', (d) => {
				const e = d as { died: boolean };
				if (e.died) grant('first-kill', 'First Blood');
			}),
			laserEvents.on('item:pickup', () =>
				grant('first-loot', 'Treasure Hunter'),
			),
			laserEvents.on('item:equipped', () =>
				grant('first-equip', 'Armed & Ready'),
			),
			laserEvents.on('player:stats', (d) => {
				const s = (d as { stats: { level?: number; kills?: number } })
					.stats;
				if (s.level && s.level >= 5) grant('lvl5', 'Seasoned (Lv 5)');
				if (s.kills && s.kills >= 10)
					grant('bounty', 'Bounty Complete');
			}),
		];
		return () => offs.forEach((o) => o());
	}, [dispatch]);

	if (toasts.length === 0) return null;
	return (
		<div className="pointer-events-none absolute left-1/2 top-32 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
			{toasts.map((t) => (
				<div
					key={t.id}
					className="animate-bounce rounded-full border border-amber-300/40 bg-black/80 px-5 py-2 backdrop-blur-md">
					<span className="text-sm font-bold text-amber-300">
						🏆 {t.title}
					</span>
				</div>
			))}
		</div>
	);
}
