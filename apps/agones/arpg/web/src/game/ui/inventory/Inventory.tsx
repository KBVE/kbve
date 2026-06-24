import { useState, type DragEvent, type ReactElement } from 'react';
import { useTranslation } from '@kbve/laser';
import type { InventoryItem } from '@kbve/laser';
import { emitInventoryIntent } from '../../systems/hud';
import { PixelPanel } from '../../PixelPanel';
import { rarityColor, type ItemMeta } from '../../entities/itemMeta';
import {
	ATLAS_URL,
	ATLAS_SIZE,
	TILE_SIZE,
	atlasCell,
} from '../../entities/itemAtlas.generated';

const ACCENT = '#fcd34d';
const MUTED = '#9fb3d8';
const TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.9)';

interface SlotDnd {
	draggable: boolean;
	onDragStart: (e: DragEvent<HTMLDivElement>) => void;
	onDragOver: (e: DragEvent<HTMLDivElement>) => void;
	onDrop: (e: DragEvent<HTMLDivElement>) => void;
}

export interface InventoryDnd {
	drag: number | null;
	floorHot: boolean;
	slotProps: (i: number, hasItem: boolean) => SlotDnd;
	floorProps: {
		onDragOver: (e: DragEvent<HTMLDivElement>) => void;
		onDragLeave: () => void;
		onDrop: (e: DragEvent<HTMLDivElement>) => void;
	};
	outsideDrop: (e: DragEvent<HTMLDivElement>) => void;
	endDrag: () => void;
}

export function useInventoryDnd(itemCount: number): InventoryDnd {
	const [drag, setDrag] = useState<number | null>(null);
	const [floorHot, setFloorHot] = useState(false);
	const endDrag = () => {
		setDrag(null);
		setFloorHot(false);
	};
	const dropToFloor = (index: number | null) => {
		if (index != null) emitInventoryIntent({ type: 'drop', index });
		endDrag();
	};
	return {
		drag,
		floorHot,
		endDrag,
		slotProps: (i, hasItem) => ({
			draggable: hasItem,
			onDragStart: (e) => {
				setDrag(i);
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', String(i));
			},
			onDragOver: (e) => {
				if (drag != null) e.preventDefault();
			},
			onDrop: (e) => {
				e.preventDefault();
				if (drag != null && drag !== i) {
					const to = Math.min(i, itemCount - 1);
					emitInventoryIntent({ type: 'reorder', from: drag, to });
				}
				endDrag();
			},
		}),
		floorProps: {
			onDragOver: (e) => {
				if (drag != null) {
					e.preventDefault();
					setFloorHot(true);
				}
			},
			onDragLeave: () => setFloorHot(false),
			onDrop: (e) => {
				e.preventDefault();
				dropToFloor(drag);
			},
		},
		outsideDrop: (e) => {
			if (drag != null && e.dataTransfer.dropEffect === 'none') {
				dropToFloor(drag);
			} else {
				endDrag();
			}
		},
	};
}

function ItemIcon({
	meta,
	itemRef,
	size,
}: {
	meta?: ItemMeta;
	itemRef: string;
	size: number;
}): ReactElement {
	if (meta?.img && meta.key > 0) {
		const cell = atlasCell(meta.key);
		const scaled = ATLAS_SIZE * (size / TILE_SIZE);
		return (
			<span
				role="img"
				aria-label={meta.name ?? itemRef}
				style={{
					display: 'block',
					width: size,
					height: size,
					backgroundImage: `url(${ATLAS_URL})`,
					backgroundRepeat: 'no-repeat',
					backgroundSize: `${scaled}px ${scaled}px`,
					backgroundPosition: `-${cell.col * size}px -${cell.row * size}px`,
					imageRendering: 'pixelated',
				}}
			/>
		);
	}
	if (meta?.emoji) {
		return (
			<span style={{ fontSize: size, lineHeight: 1 }}>{meta.emoji}</span>
		);
	}
	return (
		<span
			style={{
				fontSize: size * 0.5,
				fontWeight: 700,
				color: MUTED,
				textShadow: TEXT_SHADOW,
			}}>
			{itemRef.slice(0, 2).toUpperCase()}
		</span>
	);
}

export function InventoryBar({
	items,
	meta,
	dnd,
}: {
	items: InventoryItem[];
	meta: Map<string, ItemMeta>;
	dnd: InventoryDnd;
}): ReactElement | null {
	const { t } = useTranslation();
	if (items.length === 0) return null;
	const slots = items.slice(0, 9);
	return (
		<div
			onDragEnd={dnd.endDrag}
			style={{
				position: 'absolute',
				bottom: 14,
				left: '50%',
				transform: 'translateX(-50%)',
				display: 'flex',
				gap: 6,
			}}>
			{slots.map((it, i) => {
				const m = meta.get(it.ref);
				const slot = dnd.slotProps(i, true);
				return (
					<PixelPanel
						key={it.ref}
						variant="slate"
						scale={2}
						onClick={() =>
							emitInventoryIntent({ type: 'use', index: i })
						}
						title={t('arpg.inventory.useTitle', {
							name: m?.name ?? it.ref,
						})}
						draggable={slot.draggable}
						onDragStart={slot.onDragStart}
						onDragOver={slot.onDragOver}
						onDrop={slot.onDrop}
						style={{
							minWidth: 58,
							padding: '5px 8px 7px',
							textAlign: 'center',
							pointerEvents: 'auto',
							cursor: 'grab',
							opacity: dnd.drag === i ? 0.4 : 1,
						}}>
						<div
							style={{
								fontSize: 9,
								color: ACCENT,
								textShadow: TEXT_SHADOW,
								opacity: 0.85,
							}}>
							⇧{i + 1}
						</div>
						<div
							style={{
								height: 22,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
							}}>
							<ItemIcon meta={m} itemRef={it.ref} size={20} />
						</div>
						<div
							style={{
								fontSize: 9,
								color: rarityColor(m?.rarity),
								textShadow: TEXT_SHADOW,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								maxWidth: 58,
							}}>
							{m?.name ?? it.ref}
						</div>
						<div
							style={{
								fontSize: 11,
								fontWeight: 700,
								color: ACCENT,
								textShadow: TEXT_SHADOW,
							}}>
							×{it.count}
						</div>
					</PixelPanel>
				);
			})}
		</div>
	);
}

const GRID_COLS = 6;
const MIN_SLOTS = 24;

export function InventoryPanel({
	items,
	meta,
	dnd,
}: {
	items: InventoryItem[];
	meta: Map<string, ItemMeta>;
	dnd: InventoryDnd;
}): ReactElement {
	const { t } = useTranslation();
	const { drag, floorHot } = dnd;
	const slotCount = Math.max(
		MIN_SLOTS,
		Math.ceil(items.length / GRID_COLS) * GRID_COLS,
	);

	return (
		<div
			onDragEnd={dnd.outsideDrop}
			style={{
				position: 'absolute',
				inset: 0,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'rgba(2,3,6,0.45)',
				pointerEvents: 'auto',
			}}>
			<PixelPanel
				variant="gold"
				scale={3}
				style={{ width: 380, padding: '14px 16px 18px' }}>
				<div
					style={{
						fontSize: 14,
						fontWeight: 700,
						color: ACCENT,
						textShadow: TEXT_SHADOW,
						letterSpacing: 0.5,
						marginBottom: 12,
						textAlign: 'center',
					}}>
					{t('arpg.inventory.title')}
				</div>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
						gap: 6,
					}}>
					{Array.from({ length: slotCount }, (_, i) => {
						const it = items[i];
						const m = it ? meta.get(it.ref) : undefined;
						const isDragging = drag === i;
						const slot = dnd.slotProps(i, !!it);
						return (
							<div
								key={i}
								draggable={slot.draggable}
								title={it ? (m?.name ?? it.ref) : undefined}
								onDragStart={slot.onDragStart}
								onDragOver={slot.onDragOver}
								onDrop={slot.onDrop}
								onDoubleClick={() => {
									if (it)
										emitInventoryIntent({
											type: 'use',
											index: i,
										});
								}}
								style={{
									position: 'relative',
									minHeight: 64,
									padding: '6px 4px',
									borderRadius: 4,
									background: it
										? 'rgba(0,0,0,0.35)'
										: 'rgba(0,0,0,0.18)',
									border: `1px solid ${
										it
											? `${rarityColor(m?.rarity)}55`
											: 'rgba(120,140,180,0.18)'
									}`,
									textAlign: 'center',
									cursor: it ? 'grab' : 'default',
									opacity: isDragging ? 0.4 : 1,
								}}>
								{it && i < 9 && (
									<span
										style={{
											position: 'absolute',
											top: 2,
											left: 4,
											fontSize: 9,
											color: ACCENT,
											textShadow: TEXT_SHADOW,
											opacity: 0.85,
										}}>
										{i + 1}
									</span>
								)}
								{it && (
									<>
										<div
											style={{
												height: 24,
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												marginTop: 4,
											}}>
											<ItemIcon
												meta={m}
												itemRef={it.ref}
												size={22}
											/>
										</div>
										<div
											style={{
												fontSize: 8,
												color: rarityColor(m?.rarity),
												textShadow: TEXT_SHADOW,
												marginTop: 3,
												wordBreak: 'break-word',
											}}>
											{m?.name ?? it.ref}
										</div>
										<div
											style={{
												fontSize: 10,
												fontWeight: 700,
												color: ACCENT,
												textShadow: TEXT_SHADOW,
											}}>
											×{it.count}
										</div>
									</>
								)}
							</div>
						);
					})}
				</div>

				<div
					onDragOver={dnd.floorProps.onDragOver}
					onDragLeave={dnd.floorProps.onDragLeave}
					onDrop={dnd.floorProps.onDrop}
					style={{
						marginTop: 10,
						padding: '8px 0',
						borderRadius: 4,
						border: `1px dashed ${floorHot ? '#f87171' : 'rgba(160,120,120,0.5)'}`,
						background: floorHot
							? 'rgba(248,113,113,0.18)'
							: 'rgba(0,0,0,0.2)',
						color: floorHot ? '#fca5a5' : MUTED,
						textShadow: TEXT_SHADOW,
						textAlign: 'center',
						fontSize: 10,
					}}>
					🗑 {t('arpg.inventory.dropFloor')}
				</div>

				<div
					style={{
						marginTop: 10,
						fontSize: 9,
						color: MUTED,
						textShadow: TEXT_SHADOW,
						textAlign: 'center',
						opacity: 0.8,
					}}>
					{items.length === 0
						? t('arpg.inventory.empty')
						: t('arpg.inventory.hint')}
				</div>
			</PixelPanel>
		</div>
	);
}
