import { useState } from 'react';
import { useInventory } from '../hooks/useInventory';

const GRID_COLS = 4;
const GRID_ROWS = 4;
const TOTAL_SLOTS = GRID_COLS * GRID_ROWS;

const ITEM_ICONS: Record<string, string> = {
	log: '🪵',
	stone: '🪨',
	mossy_stone: '🪨',
	copper_ore: '🟤',
	iron_ore: '⬛',
	crystal_ore: '🟣',
	tulip: '🌷',
	daisy: '🌼',
	lavender: '💜',
	bellflower: '🔔',
	wildflower: '🌻',
	sunflower: '🌻',
	rose: '🌹',
	cornflower: '💙',
	allium: '🟣',
	blue_orchid: '💎',
	porcini: '🍄',
	chanterelle: '🍄',
	fly_agaric: '🍄',
};

const ITEM_SHORT_NAMES: Record<string, string> = {
	log: 'Log',
	stone: 'Stn',
	mossy_stone: 'Mss',
	copper_ore: 'Cu',
	iron_ore: 'Fe',
	crystal_ore: 'Cry',
	tulip: 'Tlp',
	daisy: 'Dsy',
	lavender: 'Lvn',
	bellflower: 'Bel',
	wildflower: 'Wld',
	sunflower: 'Sun',
	rose: 'Rse',
	cornflower: 'Crn',
	allium: 'All',
	blue_orchid: 'Orc',
	porcini: 'Por',
	chanterelle: 'Chn',
	fly_agaric: 'Fly',
};

export function Inventory() {
	const [open, setOpen] = useState(false);
	const inventory = useInventory();
	const items = inventory?.items ?? [];

	return (
		<div className="absolute bottom-40 right-4 md:bottom-44 md:right-6 pointer-events-auto">
			{/* Toggle button */}
			<button
				onClick={() => setOpen(!open)}
				className="block ml-auto mb-1 px-2 py-1 text-[8px] md:text-[10px]
					bg-panel-inner border-2 border-panel-border text-[#c8a832]
					shadow-[0_0_0_1px_#1a1008,0_2px_6px_rgba(0,0,0,0.5)]
					hover:bg-[#2a1c0c] active:bg-[#1a1008] transition-colors">
				{open ? 'Close' : 'Bag'}
			</button>

			{/* Inventory grid — only shown when open */}
			{open && (
				<div className="border-[3px] border-panel-border shadow-[0_0_0_1px_#1a1008,0_4px_12px_rgba(0,0,0,0.6)]">
					<div className="border-2 border-[#1a1008] bg-panel-inner p-2 md:p-3">
						<div className="text-[7px] md:text-[10px] mb-1.5 md:mb-2 text-center text-[#c8a832]">
							Inventory
						</div>
						<div className="p-1 md:p-1.5 bg-[#1e1408] border border-[#5a4a2a]">
							<div className="grid grid-cols-4 gap-px md:gap-0.5">
								{Array.from({ length: TOTAL_SLOTS }).map(
									(_, i) => {
										const item = items[i];
										return (
											<div
												key={i}
												className="w-7 h-7 md:w-11 md:h-11 bg-[#261a0a] border border-[#3d2b14]
												shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]
												flex flex-col items-center justify-center relative">
												{item && (
													<>
														<span className="text-[10px] md:text-[14px] leading-none">
															{ITEM_ICONS[
																item.kind
															] ?? '?'}
														</span>
														<span className="text-[5px] md:text-[7px] text-text-muted leading-none mt-px">
															{ITEM_SHORT_NAMES[
																item.kind
															] ?? item.kind}
														</span>
														{item.quantity > 1 && (
															<span className="absolute bottom-0 right-0.5 text-[5px] md:text-[7px] text-[#c8a832] leading-none">
																{item.quantity}
															</span>
														)}
													</>
												)}
											</div>
										);
									},
								)}
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
