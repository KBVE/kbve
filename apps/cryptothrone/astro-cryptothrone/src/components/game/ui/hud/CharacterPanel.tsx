import { useGameSelector, useGameDispatch } from '../../store/GameStoreContext';
import { StatsSection } from '../StatsSection';
import { OnlinePlayers } from '../OnlinePlayers';
import { EquipmentSummary } from '../EquipmentSummary';
import { getItemById } from '../../data/items';

export function CharacterPanel() {
	const player = useGameSelector((s) => s.player);
	const debugMode = useGameSelector((s) => s.settings.debugMode);
	const dispatch = useGameDispatch();

	return (
		<div className="flex flex-col gap-4 text-yellow-400">
			<StatsSection stats={player.stats} />

			<div>
				<h2 className="mb-2 text-lg font-semibold">User</h2>
				<p className="text-sm">{player.stats.username || 'Guest'}</p>
			</div>

			<OnlinePlayers />

			<div>
				<h2 className="mb-2 text-lg font-semibold">Equipment</h2>
				<EquipmentSummary />
				<ul className="grid grid-cols-8 gap-2">
					{Object.entries(player.inventory.equipment).map(
						([slot, itemId]) => {
							const item = itemId ? getItemById(itemId) : null;
							return (
								<li
									key={slot}
									className="flex h-8 w-8 items-center justify-center border border-gray-500 bg-gray-700 text-xs text-gray-400"
									title={item ? item.name : slot}>
									{item ? item.name[0] : ''}
								</li>
							);
						},
					)}
				</ul>
			</div>

			<label className="flex cursor-pointer items-center gap-2">
				<span className="text-sm">Debug Mode</span>
				<input
					type="checkbox"
					checked={debugMode}
					onChange={() =>
						dispatch({
							type: 'TOGGLE_SETTING',
							payload: { key: 'debugMode' },
						})
					}
					className="peer sr-only"
				/>
				<div className="relative h-4 w-10 rounded-full bg-gray-400 transition-colors peer-checked:bg-yellow-500">
					<div
						className={`absolute -left-1 -top-1 h-6 w-6 rounded-full bg-white transition-transform ${debugMode ? 'translate-x-full' : ''}`}
					/>
				</div>
			</label>
		</div>
	);
}
