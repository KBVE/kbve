import { GlassPanel } from '../ui/shared/GlassPanel';

const GRID_COLS = 4;
const GRID_ROWS = 4;

export function Inventory() {
	const slots = Array.from({ length: GRID_COLS * GRID_ROWS });

	return (
		<GlassPanel className="absolute bottom-4 right-4 p-2.5">
			<div className="text-[11px] mb-1.5 text-center">Inventory</div>
			<div className="grid grid-cols-4 gap-1">
				{slots.map((_, i) => (
					<div
						key={i}
						className="w-11 h-11 bg-glass-light border border-glass-border rounded-slot"
					/>
				))}
			</div>
		</GlassPanel>
	);
}
