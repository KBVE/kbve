import { useEffect, useRef, useState } from 'react';
import { laserEvents } from '@kbve/laser';

interface Entry {
	id: number;
	text: string;
	tone: string;
}
let counter = 0;
const MAX = 8;

export function CombatLog() {
	const [entries, setEntries] = useState<Entry[]>([]);
	const meRef = useRef(-1);

	useEffect(() => {
		const push = (text: string, tone: string) =>
			setEntries((prev) =>
				[...prev, { id: ++counter, text, tone }].slice(-MAX),
			);
		const offs = [
			laserEvents.on('combat:event', (d) => {
				const c = d as {
					target_ref: string | null;
					dmg: number;
					died: boolean;
				};
				const name = c.target_ref ?? 'enemy';
				push(
					c.died ? `${name} was slain` : `Hit ${name} for ${c.dmg}`,
					c.died ? 'text-emerald-300' : 'text-stone-300',
				);
			}),
			laserEvents.on('item:pickup', (d) => {
				const p = d as { item_ref: string; count: number };
				push(
					`Picked up ${p.item_ref}${p.count > 1 ? ` ×${p.count}` : ''}`,
					'text-amber-200',
				);
			}),
			laserEvents.on('item:used', (d) => {
				const u = d as { item_ref: string; heal: number };
				push(
					`Used ${u.item_ref}${u.heal > 0 ? ` (+${u.heal} HP)` : ''}`,
					'text-green-300',
				);
			}),
		];
		return () => offs.forEach((o) => o());
	}, []);
	void meRef;

	if (entries.length === 0) return null;
	return (
		<div className="pointer-events-none absolute bottom-36 left-1/2 z-20 w-72 max-w-[90vw] -translate-x-1/2 space-y-0.5 text-center md:bottom-3">
			{entries.map((e) => (
				<div
					key={e.id}
					className={`truncate font-mono text-[0.65rem] ${e.tone} drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]`}>
					{e.text}
				</div>
			))}
		</div>
	);
}
