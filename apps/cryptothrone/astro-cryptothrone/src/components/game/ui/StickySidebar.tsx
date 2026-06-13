import { FloatingWindow } from '@kbve/astro';
import { useGameSelector, useGameDispatch } from '../store/GameStoreContext';
import { StatsSection } from './StatsSection';
import { ToggleButton } from './ToggleButton';
import { InventoryGrid } from './InventoryGrid';
import { OnlinePlayers } from './OnlinePlayers';
import { EquipmentSummary } from './EquipmentSummary';
import { getItemById } from '../data/items';

export function StickySidebar() {
	const player = useGameSelector((s) => s.player);
	const settings = useGameSelector((s) => s.settings);
	const dispatch = useGameDispatch();

	return (
		<FloatingWindow
			storageKey="ct-sidebar-window"
			initial={{ x: 12, y: 16 }}
			size={{ width: 350, height: 520 }}
			minWidth={280}
			minHeight={220}
			title="Character"
			className="opacity-60 transition-opacity duration-500 hover:opacity-100">
			<div className="p-4 text-yellow-400">
				<div className="flex gap-2 mb-4">
					<ToggleButton
						isCollapsed={settings.isStatsCollapsed}
						onToggle={() =>
							dispatch({
								type: 'TOGGLE_SETTING',
								payload: { key: 'isStatsCollapsed' },
							})
						}
						label="Stats"
					/>
					<ToggleButton
						isCollapsed={settings.isSettingsCollapsed}
						onToggle={() =>
							dispatch({
								type: 'TOGGLE_SETTING',
								payload: { key: 'isSettingsCollapsed' },
							})
						}
						label="Settings"
					/>
				</div>

				<div
					className={`transition-all duration-500 ${settings.isSettingsCollapsed ? 'max-h-0 overflow-hidden' : 'max-h-screen'}`}>
					<div className="mb-4">
						<h2 className="text-lg font-semibold mb-2">Settings</h2>
						<label className="flex items-center cursor-pointer gap-2">
							<span className="text-sm">Debug Mode</span>
							<input
								type="checkbox"
								checked={settings.debugMode}
								onChange={() =>
									dispatch({
										type: 'TOGGLE_SETTING',
										payload: { key: 'debugMode' },
									})
								}
								className="sr-only peer"
							/>
							<div className="relative w-10 h-4 bg-gray-400 rounded-full peer-checked:bg-yellow-500 transition-colors">
								<div
									className={`absolute w-6 h-6 bg-white rounded-full -top-1 -left-1 transition-transform ${settings.debugMode ? 'translate-x-full' : ''}`}
								/>
							</div>
						</label>
					</div>
				</div>

				<div
					className={`transition-all duration-500 ${settings.isStatsCollapsed ? 'max-h-0 overflow-hidden' : 'max-h-screen'}`}>
					<StatsSection stats={player.stats} />

					<div className="mb-4">
						<h2 className="text-lg font-semibold mb-2">User</h2>
						<p className="text-sm">
							{player.stats.username || 'Guest'}
						</p>
					</div>

					<OnlinePlayers />

					<div className="mb-4">
						<h2 className="text-lg font-semibold mb-2">
							Inventory
						</h2>
						<InventoryGrid backpack={player.inventory.backpack} />
					</div>

					<div className="mb-4">
						<h2 className="text-lg font-semibold mb-2">
							Equipment
						</h2>
						<EquipmentSummary />
						<ul className="grid grid-cols-8 gap-2">
							{Object.entries(player.inventory.equipment).map(
								([slot, itemId]) => {
									const item = itemId
										? getItemById(itemId)
										: null;
									return (
										<li
											key={slot}
											className="flex items-center justify-center border border-gray-500 bg-gray-700 w-8 h-8 text-xs text-gray-400"
											title={item ? item.name : slot}>
											{item ? item.name[0] : ''}
										</li>
									);
								},
							)}
						</ul>
					</div>
				</div>
			</div>
		</FloatingWindow>
	);
}
