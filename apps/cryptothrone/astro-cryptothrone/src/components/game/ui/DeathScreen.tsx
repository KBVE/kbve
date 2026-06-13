import { useEffect, useState } from 'react';
import { laserEvents } from '@kbve/laser';
import { useGameSelector } from '../store/GameStoreContext';

export function DeathScreen() {
	const hp = useGameSelector((s) => s.player.stats.hp);
	const [dead, setDead] = useState(false);

	useEffect(() => {
		if (hp <= 0) {
			setDead(true);
			const t = window.setTimeout(() => setDead(false), 4000);
			return () => window.clearTimeout(t);
		}
		setDead(false);
	}, [hp]);

	useEffect(() => {
		return laserEvents.on('player:stats', (d) => {
			const s = (d as { stats: { hp?: number } }).stats;
			if (s.hp !== undefined && s.hp > 0) setDead(false);
		});
	}, []);

	if (!dead) return null;
	return (
		<div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-red-950/40 backdrop-blur-sm">
			<div className="text-center">
				<p className="text-4xl font-black tracking-widest text-red-400 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
					YOU DIED
				</p>
				<p className="mt-2 text-sm text-stone-300">
					The well pulls you back to the plaza…
				</p>
			</div>
		</div>
	);
}
