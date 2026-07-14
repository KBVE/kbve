import { useEffect, useState } from 'react';
import { laserEvents } from '@kbve/laser';
import { PixelPanel } from './PixelPanel';

interface Target {
	name: string;
	hp: number;
	maxHp: number;
	cat: number;
}

export function TargetFrame() {
	const [target, setTarget] = useState<Target | null>(null);
	useEffect(() => {
		const offs = [
			laserEvents.on('target:set', (d) => setTarget(d as Target)),
			laserEvents.on('target:clear', () => setTarget(null)),
		];
		return () => offs.forEach((o) => o());
	}, []);
	if (!target || target.maxHp <= 0) return null;
	const pct = Math.max(0, Math.min(100, (target.hp / target.maxHp) * 100));
	return (
		<div className="pointer-events-none absolute left-1/2 top-12 z-30 w-44 -translate-x-1/2">
			<PixelPanel variant="ruby" className="px-3 py-1.5">
				<p className="truncate text-center text-xs font-semibold text-stone-200">
					{target.name}
				</p>
				<div className="mt-1 h-1.5 w-full rounded bg-gray-700">
					<div
						className="h-full rounded bg-red-500 transition-all"
						style={{ width: `${pct}%` }}
					/>
				</div>
				<p className="mt-0.5 text-center font-mono text-[0.6rem] text-stone-400">
					{target.hp}/{target.maxHp}
				</p>
			</PixelPanel>
		</div>
	);
}
