import { useGameSelector } from '../store/GameStoreContext';

export function GoldCounter() {
	const backpack = useGameSelector((s) => s.player.inventory.backpack);
	const gold = backpack.filter((id) => id === 'coin').length;
	return (
		<div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
			<div className="flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-black/55 px-3 py-1 backdrop-blur-md">
				<span className="inline-block h-3 w-3 rounded-full bg-gradient-to-b from-amber-200 to-amber-500" />
				<span className="font-mono text-xs font-semibold text-amber-200">
					{gold}
				</span>
			</div>
		</div>
	);
}
