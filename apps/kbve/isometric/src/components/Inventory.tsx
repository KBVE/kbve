const GRID_COLS = 4;
const GRID_ROWS = 4;

export function Inventory() {
	const slots = Array.from({ length: GRID_COLS * GRID_ROWS });

	return (
		<div className="absolute bottom-4 right-4 p-1.5 bg-panel border-2 border-panel-border shadow-panel pointer-events-auto">
			<div className="text-[7px] mb-1 text-center text-text-muted">
				Inventory
			</div>
			<div className="grid grid-cols-4 gap-0.5">
				{slots.map((_, i) => (
					<div
						key={i}
						className="w-7 h-7 bg-slot border border-slot-border"
					/>
				))}
			</div>
		</div>
	);
}
