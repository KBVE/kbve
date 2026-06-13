import { useEffect } from 'react';
import { laserEvents } from '@kbve/laser';
import { useGameSelector } from '../store/GameStoreContext';
import { getItemById } from '../data/items';
import { ITEM_ICON_FALLBACK } from '../data/itemdb';

const SLOTS = 4;

export function Hotbar() {
	const backpack = useGameSelector((s) => s.player.inventory.backpack);
	const consumables = Array.from(new Set(backpack)).filter((id) => {
		const item = getItemById(id);
		return item?.type === 'consumable';
	});
	const slots = consumables.slice(0, SLOTS);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const active = document.activeElement;
			if (
				active instanceof HTMLInputElement ||
				active instanceof HTMLTextAreaElement
			)
				return;
			const n = Number(e.key);
			if (n >= 1 && n <= SLOTS && slots[n - 1]) {
				laserEvents.emit('item:use', { ref: slots[n - 1] });
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [slots]);

	if (slots.length === 0) return null;
	return (
		<div className="pointer-events-auto absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-1.5">
			{slots.map((id, i) => {
				const item = getItemById(id);
				return (
					<button
						key={id}
						type="button"
						onClick={() =>
							laserEvents.emit('item:use', { ref: id })
						}
						title={`${item?.name ?? id} (${i + 1})`}
						className="relative h-11 w-11 rounded-lg border border-amber-300/30 bg-black/55 backdrop-blur-md transition hover:border-amber-300">
						{item?.img && (
							<img
								src={item.img}
								alt={item.name}
								onError={(e) => {
									const el = e.currentTarget;
									if (el.src !== ITEM_ICON_FALLBACK)
										el.src = ITEM_ICON_FALLBACK;
								}}
								className="h-full w-full object-contain p-1"
							/>
						)}
						<span className="absolute bottom-0 right-0.5 font-mono text-[0.6rem] text-stone-400">
							{i + 1}
						</span>
					</button>
				);
			})}
		</div>
	);
}
