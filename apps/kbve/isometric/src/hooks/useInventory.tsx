import { useEffect, useRef, useState } from 'react';
import { get_inventory_json } from '../../wasm-pkg/isometric_game.js';
import { gameEvents } from '../ui/events/event-bus';

interface ItemStack {
	kind: string;
	quantity: number;
}

interface InventoryData {
	items: ItemStack[];
	max_slots: number;
}

const ITEM_NAMES: Record<string, string> = {
	log: 'Log',
	stone: 'Stone',
	mossy_stone: 'Mossy Stone',
	copper_ore: 'Copper Ore',
	iron_ore: 'Iron Ore',
	crystal_ore: 'Crystal Ore',
	tulip: 'Tulip',
	daisy: 'Daisy',
	lavender: 'Lavender',
	bellflower: 'Bellflower',
	wildflower: 'Wildflower',
	sunflower: 'Sunflower',
	rose: 'Rose',
	cornflower: 'Cornflower',
	allium: 'Allium',
	blue_orchid: 'Blue Orchid',
	porcini: 'Porcini',
	chanterelle: 'Chanterelle',
	fly_agaric: 'Fly Agaric',
};

export function useInventory() {
	const [inventory, setInventory] = useState<InventoryData | null>(null);
	const prevItemsRef = useRef<Map<string, number>>(new Map());

	useEffect(() => {
		const interval = setInterval(() => {
			try {
				const json = get_inventory_json();
				if (!json) return;

				const data = JSON.parse(json) as InventoryData;
				setInventory(data);

				// Check for new items to show loot toast
				const current = new Map<string, number>();
				for (const item of data.items) {
					current.set(item.kind, item.quantity);
				}

				const prev = prevItemsRef.current;
				for (const [kind, qty] of current) {
					const prevQty = prev.get(kind) ?? 0;
					if (qty > prevQty) {
						const gained = qty - prevQty;
						const name = ITEM_NAMES[kind] ?? kind;
						gameEvents.emit('toast:show', {
							message: `+${gained} ${name}`,
							severity: 'loot',
						});
					}
				}

				prevItemsRef.current = current;
			} catch {
				// WASM not ready
			}
		}, 200);

		return () => clearInterval(interval);
	}, []);

	return inventory;
}
