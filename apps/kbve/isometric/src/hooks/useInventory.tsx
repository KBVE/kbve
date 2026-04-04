import { useEffect, useState } from 'react';
import { get_inventory_json } from '../../wasm-pkg/isometric_game.js';

interface ItemStack {
	kind: string;
	quantity: number;
}

interface InventoryData {
	items: ItemStack[];
	max_slots: number;
}

export function useInventory() {
	const [inventory, setInventory] = useState<InventoryData | null>(null);

	useEffect(() => {
		const interval = setInterval(() => {
			try {
				const json = get_inventory_json();
				if (!json) return;
				setInventory(JSON.parse(json) as InventoryData);
			} catch {
				// WASM not ready
			}
		}, 200);

		return () => clearInterval(interval);
	}, []);

	return inventory;
}
