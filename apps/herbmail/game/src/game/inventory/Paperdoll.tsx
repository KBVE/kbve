import { PIECE_BY_ID, setArmor, useEquippedArmor } from '../character/armor';
import { unequip, useHands } from '../viewmodel/store';
import { itemDef } from './items';
import { kbve } from './tags';

interface DisplaySlot {
	id: string;
	/** Body slotKeys this cell represents; a set item occupying any shows here. */
	keys: string[];
	col: number;
	row: number;
}

// Humanoid arrangement over a 3-column grid, one cell per equipment SET
// location (pairs and quads share a cell — items are sets now).
const SLOTS: DisplaySlot[] = [
	{ id: 'hair', keys: ['HAIR'], col: 1, row: 1 },
	{ id: 'head', keys: ['AHED'], col: 2, row: 1 },
	{ id: 'face', keys: ['AFAC'], col: 2, row: 2 },
	{ id: 'shoulders', keys: ['ASHL', 'ASHR'], col: 1, row: 3 },
	{ id: 'back', keys: ['ABAC'], col: 3, row: 3 },
	{ id: 'chest', keys: ['TORS'], col: 2, row: 3 },
	{ id: 'upperArms', keys: ['AUPL', 'AUPR'], col: 1, row: 4 },
	{ id: 'elbows', keys: ['AEBL', 'AEBR'], col: 3, row: 4 },
	{ id: 'bracers', keys: ['ALWL', 'ALWR'], col: 1, row: 5 },
	{ id: 'hands', keys: ['HNDL', 'HNDR'], col: 3, row: 5 },
	{ id: 'hips', keys: ['HIPS'], col: 2, row: 4 },
	{ id: 'faulds', keys: ['AHPF', 'AHPB', 'AHPL', 'AHPR'], col: 2, row: 5 },
	{ id: 'legs', keys: ['LEGL', 'LEGR'], col: 1, row: 6 },
	{ id: 'knees', keys: ['AKNL', 'AKNR'], col: 3, row: 6 },
	{ id: 'feet', keys: ['FOTL', 'FOTR'], col: 2, row: 6 },
];

const SIZE = 44;

function wornPiece(keys: string[], equipped: Set<string>): string | null {
	for (const id of equipped) {
		const p = PIECE_BY_ID.get(id);
		if (p && p.slotKeys.some((k) => keys.includes(k))) return id;
	}
	return null;
}

/** Display-slot id a piece belongs on (first cell sharing a slotKey). */
export function displaySlotFor(pieceId: string): string | null {
	const p = PIECE_BY_ID.get(pieceId);
	if (!p) return null;
	for (const s of SLOTS) {
		if (p.slotKeys.some((k) => s.keys.includes(k))) return s.id;
	}
	return null;
}

function Slot({
	slot,
	equipped,
}: {
	slot: DisplaySlot;
	equipped: Set<string>;
}) {
	const id = wornPiece(slot.keys, equipped);
	const def = id ? itemDef(id) : undefined;
	const on = id !== null;
	return (
		<div
			id={`pd-slot-${slot.id}`}
			data-armor-slot={slot.id}
			data-x-kbve={kbve('slot', { id: slot.id, worn: id ?? '' })}
			title={def?.label ?? slot.id}
			onClick={() => {
				if (id) setArmor(id, false);
			}}
			style={{
				width: SIZE,
				height: SIZE,
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
			{on && def?.icon ? (
				<img
					src={def.icon}
					alt={def.label}
					width={SIZE - 6}
					height={SIZE - 6}
					style={{ imageRendering: 'pixelated' }}
				/>
			) : (
				(def?.label ?? '')
			)}
		</div>
	);
}

// Held-item cell (right/left hand): shows what the hand carries, click puts it
// back in the grid. Separate from armor slots — hands live in the viewmodel
// store, not the paperdoll's slotKey system.
function HandSlot({ side, id }: { side: 'right' | 'left'; id: string | null }) {
	const def = id ? itemDef(id) : undefined;
	const on = id !== null;
	return (
		<div
			id={`pd-hand-${side}`}
			data-x-kbve={kbve('hand', { side, held: id ?? '' })}
			title={def?.label ?? `${side} hand`}
			onClick={() => {
				if (id) unequip(id);
			}}
			style={{
				width: SIZE,
				height: SIZE,
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
					: '1px dashed rgba(120,182,255,0.3)',
				color: on ? '#0a0a0e' : 'rgba(120,182,255,0.45)',
				fontWeight: on ? 700 : 400,
				cursor: on ? 'pointer' : 'default',
				userSelect: 'none',
			}}>
			{on && def?.icon ? (
				<img
					src={def.icon}
					alt={def.label}
					width={SIZE - 6}
					height={SIZE - 6}
					style={{ imageRendering: 'pixelated' }}
				/>
			) : on ? (
				(def?.label ?? '')
			) : side === 'right' ? (
				'R hand'
			) : (
				'L hand'
			)}
		</div>
	);
}

export function Paperdoll() {
	const equipped = useEquippedArmor();
	const hands = useHands();
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
						key={s.id}
						style={{ gridColumn: s.col, gridRow: s.row }}>
						<Slot slot={s} equipped={equipped} />
					</div>
				))}
				<div style={{ gridColumn: 1, gridRow: 7 }}>
					<HandSlot side="right" id={hands.right} />
				</div>
				<div style={{ gridColumn: 3, gridRow: 7 }}>
					<HandSlot side="left" id={hands.left} />
				</div>
			</div>
		</div>
	);
}
