const GRID_COLS = 4;
const GRID_ROWS = 4;
const SLOT_SIZE = 44;
const GAP = 4;

export function Inventory() {
	const slots = Array.from({ length: GRID_COLS * GRID_ROWS });

	return (
		<div
			style={{
				position: 'absolute',
				bottom: 16,
				right: 16,
				padding: 10,
				background: 'rgba(0,0,0,0.55)',
				borderRadius: 8,
				backdropFilter: 'blur(4px)',
				pointerEvents: 'auto',
			}}>
			<div style={{ fontSize: 11, marginBottom: 6, textAlign: 'center' }}>
				Inventory
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: `repeat(${GRID_COLS}, ${SLOT_SIZE}px)`,
					gap: GAP,
				}}>
				{slots.map((_, i) => (
					<div
						key={i}
						style={{
							width: SLOT_SIZE,
							height: SLOT_SIZE,
							background: 'rgba(255,255,255,0.08)',
							border: '1px solid rgba(255,255,255,0.15)',
							borderRadius: 4,
						}}
					/>
				))}
			</div>
		</div>
	);
}
