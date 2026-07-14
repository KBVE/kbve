import { PIECE_BY_ID, setArmor, useEquippedArmor } from '../character/armor';
import { itemDef } from './items';
import { kbve } from './tags';

interface SlotPos {
	key: string;
	col: number;
	row: number;
}

// Humanoid arrangement over a 3-column grid, one cell per body location
// (armor.ts slotKey). Faulds (4) and knees (2) sit in their own sub-clusters so
// the center column reads as head/torso/hips/legs.
const SLOTS: SlotPos[] = [
	{ key: 'HAIR', col: 1, row: 1 },
	{ key: 'AHED', col: 2, row: 1 },
	{ key: 'AFAC', col: 2, row: 2 },
	{ key: 'ASHL', col: 1, row: 3 },
	{ key: 'ABAC', col: 2, row: 3 },
	{ key: 'ASHR', col: 3, row: 3 },
	{ key: 'AUPL', col: 1, row: 4 },
	{ key: 'TORS', col: 2, row: 4 },
	{ key: 'AUPR', col: 3, row: 4 },
	{ key: 'AEBL', col: 1, row: 5 },
	{ key: 'AEBR', col: 3, row: 5 },
	{ key: 'ALWL', col: 1, row: 6 },
	{ key: 'ALWR', col: 3, row: 6 },
	{ key: 'HNDL', col: 1, row: 7 },
	{ key: 'HIPS', col: 2, row: 7 },
	{ key: 'HNDR', col: 3, row: 7 },
	{ key: 'LEGL', col: 1, row: 8 },
	{ key: 'LEGR', col: 3, row: 8 },
	{ key: 'FOTL', col: 1, row: 9 },
	{ key: 'FOTR', col: 3, row: 9 },
];

const FAULDS = ['AHPF', 'AHPR', 'AHPL', 'AHPB'];
const KNEES = ['AKNL', 'AKNR'];

const SIZE = 34;
const SUB = 15;

function wornPiece(key: string, equipped: Set<string>): string | null {
	for (const id of equipped) {
		if (PIECE_BY_ID.get(id)?.slotKey === key) return id;
	}
	return null;
}

function Slot({
	slotKey,
	equipped,
	size = SIZE,
}: {
	slotKey: string;
	equipped: Set<string>;
	size?: number;
}) {
	const id = wornPiece(slotKey, equipped);
	const def = id ? itemDef(id) : undefined;
	const on = id !== null;
	return (
		<div
			id={`pd-slot-${slotKey}`}
			data-armor-slot={slotKey}
			data-x-kbve={kbve('slot', { id: slotKey, worn: id ?? '' })}
			title={def?.label ?? slotKey}
			onClick={() => {
				if (id) setArmor(id, false);
			}}
			style={{
				width: size,
				height: size,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				textAlign: 'center',
				fontSize: 7,
				lineHeight: 1.05,
				overflow: 'hidden',
				borderRadius: 3,
				background: on
					? (def?.color ?? '#888')
					: 'rgba(255,255,255,0.03)',
				border: on
					? '1px solid rgba(0,0,0,0.5)'
					: '1px dashed rgba(255,255,255,0.18)',
				color: on ? '#0a0a0e' : 'rgba(255,255,255,0.28)',
				fontWeight: on ? 700 : 400,
				cursor: on ? 'pointer' : 'default',
				userSelect: 'none',
			}}>
			{(def?.label ?? '').replace(/ ?\(([LR])\)/, '$1')}
		</div>
	);
}

export function Paperdoll() {
	const equipped = useEquippedArmor();
	return (
		<div
			id="paperdoll"
			data-x-kbve={kbve('paperdoll', { worn: equipped.size })}
			style={{ minWidth: 168, font: '12px monospace', color: '#c9c9d6' }}>
			<div style={{ opacity: 0.7, marginBottom: 8 }}>
				equipment · click to remove
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: `repeat(3, ${SIZE}px)`,
					gap: 4,
					justifyContent: 'center',
				}}>
				{SLOTS.map((s) => (
					<div
						key={s.key}
						style={{ gridColumn: s.col, gridRow: s.row }}>
						<Slot slotKey={s.key} equipped={equipped} />
					</div>
				))}
				<div
					style={{
						gridColumn: 2,
						gridRow: '5 / span 2',
						display: 'grid',
						gridTemplateColumns: `repeat(2, ${SUB}px)`,
						gap: 4,
						alignContent: 'center',
						justifyContent: 'center',
					}}>
					{FAULDS.map((key) => (
						<Slot
							key={key}
							slotKey={key}
							equipped={equipped}
							size={SUB}
						/>
					))}
				</div>
				<div
					style={{
						gridColumn: 2,
						gridRow: 8,
						display: 'grid',
						gridTemplateColumns: `repeat(2, ${SUB}px)`,
						gap: 4,
						alignContent: 'center',
						justifyContent: 'center',
					}}>
					{KNEES.map((key) => (
						<Slot
							key={key}
							slotKey={key}
							equipped={equipped}
							size={SUB}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
