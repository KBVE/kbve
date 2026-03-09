const GRID_COLS = 4;
const GRID_ROWS = 4;

export function Inventory() {
	const slots = Array.from({ length: GRID_COLS * GRID_ROWS });

	return (
		<div className="absolute bottom-4 right-4 pointer-events-auto">
			{/* Outer frame — golden border */}
			<div className="border-[3px] border-panel-border shadow-[0_0_0_1px_#1a1008,0_4px_12px_rgba(0,0,0,0.6)]">
				{/* Inner frame — dark inset */}
				<div className="border-2 border-[#1a1008] bg-panel-inner p-2">
					<div className="text-[7px] mb-1.5 text-center text-[#c8a832]">
						Inventory
					</div>
					{/* Slot grid inside inset panel */}
					<div className="p-1 bg-[#1e1408] border border-[#5a4a2a]">
						<div className="grid grid-cols-4 gap-px">
							{slots.map((_, i) => (
								<div
									key={i}
									className="w-7 h-7 bg-[#261a0a] border border-[#3d2b14]
										shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]"
								/>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
