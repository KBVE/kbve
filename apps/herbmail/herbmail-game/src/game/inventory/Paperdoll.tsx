import { setArmor, useEquippedArmor } from '../character/armor';
import { itemDef } from './items';
import { kbve } from './tags';

interface SlotPos {
	id: string;
	col: number;
	row: number;
}

// Humanoid arrangement over a 3-column grid. Faulds (4) and knees (2) sit in
// their own sub-clusters so the center column reads as hips/legs.
const SLOTS: SlotPos[] = [
	{ id: 'helmet', col: 2, row: 1 },
	{ id: 'eyePatch', col: 2, row: 2 },
	{ id: 'pauldronL', col: 1, row: 3 },
	{ id: 'backpack', col: 2, row: 3 },
	{ id: 'pauldronR', col: 3, row: 3 },
	{ id: 'upperArmL', col: 1, row: 4 },
	{ id: 'upperArmR', col: 3, row: 4 },
	{ id: 'elbowL', col: 1, row: 5 },
	{ id: 'elbowR', col: 3, row: 5 },
	{ id: 'bracerL', col: 1, row: 6 },
	{ id: 'bracerR', col: 3, row: 6 },
];

const FAULDS = ['fauldFront', 'fauldRight', 'fauldLeft', 'fauldBack'];
const KNEES = ['kneeL', 'kneeR'];

const SIZE = 34;
const SUB = 15;

function Slot({
	id,
	equipped,
	size = SIZE,
}: {
	id: string;
	equipped: Set<string>;
	size?: number;
}) {
	const def = itemDef(id);
	const on = equipped.has(id);
	return (
		<div
			id={`pd-slot-${id}`}
			data-armor-slot={id}
			data-x-kbve={kbve('slot', { id, on: on ? 1 : 0 })}
			title={def?.label ?? id}
			onClick={() => {
				if (on) setArmor(id, false);
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
			{(def?.label ?? id).replace(/ ?\(([LR])\)/, '$1')}
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
						key={s.id}
						style={{ gridColumn: s.col, gridRow: s.row }}>
						<Slot id={s.id} equipped={equipped} />
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
					{FAULDS.map((id) => (
						<Slot key={id} id={id} equipped={equipped} size={SUB} />
					))}
				</div>
				<div
					style={{
						gridColumn: 2,
						gridRow: 7,
						display: 'flex',
						gap: 4,
						justifyContent: 'center',
					}}>
					{KNEES.map((id) => (
						<Slot key={id} id={id} equipped={equipped} size={SUB} />
					))}
				</div>
			</div>
		</div>
	);
}
