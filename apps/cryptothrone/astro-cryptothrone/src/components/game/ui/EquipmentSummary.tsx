import { useEffect, useState } from 'react';
import { laserEvents } from '@kbve/laser';

export function EquipmentSummary() {
	const [stats, setStats] = useState({ attack: 0, defense: 0 });
	useEffect(() => {
		const offs = [
			laserEvents.on('player:stats', (d) => {
				const s = (d as { stats: { attack?: number } }).stats;
				if (s.attack !== undefined)
					setStats((p) => ({ ...p, attack: s.attack as number }));
			}),
			laserEvents.on('item:equipped', (d) => {
				const e = d as { attack: number; defense?: number };
				setStats({ attack: e.attack, defense: e.defense ?? 0 });
			}),
		];
		return () => offs.forEach((o) => o());
	}, []);
	return (
		<div className="mb-4 flex gap-3 text-xs">
			<span className="text-red-300">⚔ {stats.attack}</span>
			<span className="text-blue-300">🛡 {stats.defense}</span>
		</div>
	);
}
