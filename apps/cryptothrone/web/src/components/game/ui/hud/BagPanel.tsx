import { useGameSelector } from '../../store/GameStoreContext';
import { InventoryGrid } from '../InventoryGrid';

export function BagPanel() {
	const backpack = useGameSelector((s) => s.player.inventory.backpack);
	return (
		<div className="flex flex-col gap-2 text-yellow-400">
			<h2 className="text-lg font-semibold">Inventory</h2>
			<InventoryGrid backpack={backpack} />
		</div>
	);
}
