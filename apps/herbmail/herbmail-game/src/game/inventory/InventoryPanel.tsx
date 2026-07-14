import { useEffect, useRef, useState } from 'react';
import { COLS, ROWS, canPlace, rotate, type Rot } from './grid';
import { itemDef } from './items';
import {
	autoEquip,
	move,
	rectOf,
	sortInventory,
	useInventory,
	useInventoryOpen,
	type PlacedItem,
} from './store';
import { setEquipped } from '../viewmodel/store';
import { setArmor } from '../character/armor';
import { isArmorItem } from './items';
import { Paperdoll, displaySlotFor } from './Paperdoll';
import { kbve } from './tags';

const CELL = 42;
const GAP = 2;

interface Drag {
	uid: number;
	itemId: string;
	rot: Rot;
	// grab offset within the item, in cells
	offX: number;
	offY: number;
	// grid rect captured at grab time; reading the ref during render is a
	// react-compiler violation and thrashes layout, so snapshot it once here.
	origin: DOMRect;
}

// Top-left target cell for the dragged item from the current pointer position.
function targetCell(
	clientX: number,
	clientY: number,
	origin: DOMRect,
	drag: Drag,
): { x: number; y: number } {
	const cx = Math.floor((clientX - origin.left) / (CELL + GAP));
	const cy = Math.floor((clientY - origin.top) / (CELL + GAP));
	return { x: cx - drag.offX, y: cy - drag.offY };
}

export function InventoryPanel() {
	const open = useInventoryOpen();
	const items = useInventory();
	const gridRef = useRef<HTMLDivElement>(null);
	const [drag, setDrag] = useState<Drag | null>(null);
	const [pointer, setPointer] = useState({ x: 0, y: 0 });

	useEffect(() => {
		if (!drag) return;
		const onMove = (e: PointerEvent) =>
			setPointer({ x: e.clientX, y: e.clientY });
		const onUp = (e: PointerEvent) => {
			const slot = (
				document.elementFromPoint(
					e.clientX,
					e.clientY,
				) as HTMLElement | null
			)?.closest('[data-armor-slot]') as HTMLElement | null;
			const slotId = slot?.dataset.armorSlot;
			if (slotId && displaySlotFor(drag.itemId) === slotId) {
				setArmor(drag.itemId, true);
				setDrag(null);
				return;
			}
			const origin = gridRef.current?.getBoundingClientRect();
			if (origin) {
				const t = targetCell(e.clientX, e.clientY, origin, drag);
				move(drag.uid, t.x, t.y, drag.rot);
			}
			setDrag(null);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.code === 'KeyR') {
				e.preventDefault();
				setDrag((d) => (d ? { ...d, rot: (d.rot ^ 1) as Rot } : d));
			}
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('keydown', onKey);
		};
	}, [drag]);

	if (!open) return null;

	const startDrag = (e: React.PointerEvent, p: PlacedItem) => {
		e.preventDefault();
		const origin = gridRef.current?.getBoundingClientRect();
		if (!origin) return;
		const cx = Math.floor((e.clientX - origin.left) / (CELL + GAP));
		const cy = Math.floor((e.clientY - origin.top) / (CELL + GAP));
		setPointer({ x: e.clientX, y: e.clientY });
		setDrag({
			uid: p.uid,
			itemId: p.itemId,
			rot: p.rot,
			offX: cx - p.x,
			offY: cy - p.y,
			origin,
		});
	};

	const equip = (p: PlacedItem) => {
		if (isArmorItem(p.itemId)) {
			setArmor(p.itemId, true);
			return;
		}
		const def = itemDef(p.itemId);
		if (def?.equipId) setEquipped(def.equipId);
	};

	// Live ghost + validity while dragging.
	let ghost: {
		x: number;
		y: number;
		w: number;
		h: number;
		ok: boolean;
	} | null = null;
	if (drag) {
		const origin = drag.origin;
		if (origin) {
			const t = targetCell(pointer.x, pointer.y, origin, drag);
			const def = itemDef(drag.itemId);
			const { w, h } = rotate(def ? def.fp : { w: 1, h: 1 }, drag.rot);
			const others = items.filter((p) => p.uid !== drag.uid).map(rectOf);
			ghost = {
				x: t.x,
				y: t.y,
				w,
				h,
				ok: canPlace(others, t.x, t.y, w, h),
			};
		}
	}

	const width = COLS * CELL + (COLS - 1) * GAP;
	const height = ROWS * CELL + (ROWS - 1) * GAP;

	return (
		<div
			id="inv-overlay"
			data-x-kbve={kbve('overlay', { open: 1 })}
			style={{
				position: 'fixed',
				inset: 0,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'rgba(4,4,8,0.45)',
				zIndex: 20,
			}}>
			<div
				id="inv-panel"
				data-x-kbve={kbve('panel', { cols: COLS, rows: ROWS })}
				style={{
					display: 'flex',
					gap: 18,
					padding: 14,
					background: 'rgba(10,10,14,0.92)',
					border: '1px solid #333',
					borderRadius: 8,
					font: '12px monospace',
					color: '#c9c9d6',
				}}>
				<div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							marginBottom: 10,
						}}>
						<span style={{ opacity: 0.7 }}>inventory</span>
						<div style={{ display: 'flex', gap: 6 }}>
							<button
								id="inv-auto-equip-btn"
								data-x-kbve={kbve('action', {
									name: 'auto-equip',
								})}
								onClick={autoEquip}
								style={{
									font: '11px monospace',
									color: '#c9c9d6',
									background: 'rgba(255,255,255,0.06)',
									border: '1px solid #444',
									borderRadius: 4,
									padding: '3px 9px',
									cursor: 'pointer',
								}}>
								auto-equip
							</button>
							<button
								id="inv-sort-btn"
								data-x-kbve={kbve('action', {
									name: 'auto-sort',
								})}
								onClick={sortInventory}
								style={{
									font: '11px monospace',
									color: '#c9c9d6',
									background: 'rgba(255,255,255,0.06)',
									border: '1px solid #444',
									borderRadius: 4,
									padding: '3px 9px',
									cursor: 'pointer',
								}}>
								auto-sort
							</button>
						</div>
					</div>

					<div
						id="inv-grid"
						data-x-kbve={kbve('grid', {
							cols: COLS,
							rows: ROWS,
							count: items.length,
						})}
						ref={gridRef}
						style={{
							position: 'relative',
							width,
							height,
							display: 'grid',
							gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
							gridTemplateRows: `repeat(${ROWS}, ${CELL}px)`,
							gap: GAP,
						}}>
						{Array.from({ length: COLS * ROWS }, (_, i) => {
							const cx = i % COLS;
							const cy = Math.floor(i / COLS);
							return (
								<div
									key={i}
									id={`inv-cell-${cx}-${cy}`}
									data-x-kbve={kbve('cell', {
										x: cx,
										y: cy,
										i,
									})}
									style={{
										background: 'rgba(255,255,255,0.04)',
										borderRadius: 2,
									}}
								/>
							);
						})}

						{items.map((p) => {
							const def = itemDef(p.itemId);
							const { w, h } = rotate(
								def ? def.fp : { w: 1, h: 1 },
								p.rot,
							);
							const dragging = drag?.uid === p.uid;
							return (
								<div
									key={p.uid}
									id={`inv-item-${p.itemId}-${p.uid}`}
									data-x-kbve={kbve('item', {
										id: p.itemId,
										uid: p.uid,
										type: def?.equipId ? 'equip' : 'loot',
										equip: def?.equipId,
										x: p.x,
										y: p.y,
										w,
										h,
										rot: p.rot,
									})}
									onPointerDown={(e) => startDrag(e, p)}
									onDoubleClick={() => equip(p)}
									style={{
										position: 'absolute',
										left: p.x * (CELL + GAP),
										top: p.y * (CELL + GAP),
										width: w * CELL + (w - 1) * GAP,
										height: h * CELL + (h - 1) * GAP,
										background: def?.color ?? '#666',
										border: '1px solid rgba(0,0,0,0.5)',
										borderRadius: 3,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										textAlign: 'center',
										fontSize: 10,
										color: '#0a0a0e',
										fontWeight: 700,
										cursor: 'grab',
										opacity: dragging ? 0.35 : 1,
										userSelect: 'none',
										touchAction: 'none',
									}}>
									{def?.icon ? (
										<img
											src={def.icon}
											alt={def.label}
											style={{
												maxWidth: '90%',
												maxHeight: '80%',
												imageRendering: 'pixelated',
												pointerEvents: 'none',
											}}
										/>
									) : (
										(def?.label ?? p.itemId)
									)}
								</div>
							);
						})}

						{ghost && (
							<div
								id="inv-ghost"
								data-x-kbve={kbve('ghost', {
									x: ghost.x,
									y: ghost.y,
									w: ghost.w,
									h: ghost.h,
									ok: ghost.ok ? 1 : 0,
								})}
								style={{
									position: 'absolute',
									left: ghost.x * (CELL + GAP),
									top: ghost.y * (CELL + GAP),
									width: ghost.w * CELL + (ghost.w - 1) * GAP,
									height:
										ghost.h * CELL + (ghost.h - 1) * GAP,
									background: ghost.ok
										? 'rgba(79,220,106,0.28)'
										: 'rgba(224,72,58,0.28)',
									border: `1px solid ${
										ghost.ok ? '#4fdc6a' : '#e0483a'
									}`,
									borderRadius: 3,
									pointerEvents: 'none',
								}}
							/>
						)}
					</div>

					<div style={{ opacity: 0.5, marginTop: 10 }}>
						drag to move · R rotate · double-click / drag to slot to
						equip · I close
					</div>
				</div>

				<Paperdoll />
			</div>
		</div>
	);
}
