import { useState, type DragEvent, type ReactElement } from 'react';
import { useTranslation } from '@kbve/laser';
import type { InventoryItem } from '@kbve/laser';
import { emitInventoryIntent, emitInventoryOpen } from '../../systems/hud';
import { PixelPanel } from '../../PixelPanel';
import { rarityColor, type ItemMeta } from '../../entities/itemMeta';
import {
	ATLAS_URL,
	ATLAS_SIZE,
	TILE_SIZE,
	atlasCell,
} from '../../entities/itemAtlas.generated';
import {
	GothicPanel,
	GothicSlot,
	GothicTitleBar,
	GothicDivider,
	GothicCloseButton,
	useMountTransition,
} from '../gothic/Gothic';

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
	// Atlas is the source of truth for every item: each key slot holds the item's
	// pixel art, or a "?" placeholder until art (`img:`) is added to its MDX and
	// the atlas is regenerated. Render it for any keyed item so all items share
	// one pipeline; emoji/text only cover items with no atlas key at all.
	if (meta && meta.key > 0) {
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
const GRID_ROWS = 7;
const SLOT_GAP = 5;

export function InventoryPanel({
	open,
	items,
	meta,
	dnd,
}: {
	open: boolean;
	items: InventoryItem[];
	meta: Map<string, ItemMeta>;
	dnd: InventoryDnd;
}): ReactElement | null {
	const { t } = useTranslation();
	const { drag, floorHot } = dnd;
	const slotCount = GRID_COLS * GRID_ROWS;
	const { mounted, shown } = useMountTransition(open, 200);
	if (!mounted) return null;

	return (
		<div
			onDragEnd={dnd.outsideDrop}
			style={{
				position: 'absolute',
				inset: 0,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: shown ? 'rgba(2,3,6,0.55)' : 'rgba(2,3,6,0)',
				pointerEvents: shown ? 'auto' : 'none',
				transition: 'background 0.2s ease',
			}}>
			<GothicPanel
				padding={18}
				style={{
					position: 'relative',
					width: 380,
					filter: 'drop-shadow(0 14px 40px rgba(0,0,0,0.6))',
					transformOrigin: 'center',
					transform: shown ? 'scale(1)' : 'scale(0.9)',
					opacity: shown ? 1 : 0,
					transition:
						'transform 0.2s cubic-bezier(0.2,0.8,0.3,1.1), opacity 0.2s ease',
				}}>
				<GothicCloseButton
					size={32}
					onClick={() => emitInventoryOpen(false)}
					style={{
						position: 'absolute',
						top: -16,
						right: -16,
						zIndex: 1,
					}}
				/>
				<GothicTitleBar style={{ marginBottom: 12 }}>
					{t('arpg.inventory.title')}
				</GothicTitleBar>

				<div
					style={{
						display: 'grid',
						gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
						gap: SLOT_GAP,
					}}>
					{Array.from({ length: slotCount }, (_, i) => {
						const it = items[i];
						const m = it ? meta.get(it.ref) : undefined;
						const isDragging = drag === i;
						const slot = dnd.slotProps(i, !!it);
						return (
							<GothicSlot
								key={i}
								title={it ? (m?.name ?? it.ref) : undefined}
								draggable={slot.draggable}
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
									cursor: it ? 'grab' : 'default',
									opacity: isDragging ? 0.4 : 1,
								}}>
								{it && (
									<>
										<ItemIcon
											meta={m}
											itemRef={it.ref}
											size={30}
										/>
										{it.count > 1 && (
											<span
												style={{
													position: 'absolute',
													right: 4,
													bottom: 2,
													fontSize: 10,
													fontWeight: 700,
													color: ACCENT,
													textShadow: TEXT_SHADOW,
												}}>
												{it.count}
											</span>
										)}
									</>
								)}
							</GothicSlot>
						);
					})}
				</div>

				<GothicDivider style={{ margin: '12px 0 8px' }} />

				<div
					onDragOver={dnd.floorProps.onDragOver}
					onDragLeave={dnd.floorProps.onDragLeave}
					onDrop={dnd.floorProps.onDrop}
					style={{
						padding: '7px 0',
						borderRadius: 4,
						textAlign: 'center',
						fontSize: 10,
						color: floorHot ? '#fca5a5' : MUTED,
						textShadow: TEXT_SHADOW,
						border: `1px dashed ${floorHot ? '#f87171' : 'rgba(160,120,120,0.4)'}`,
						background: floorHot
							? 'rgba(248,113,113,0.18)'
							: 'rgba(0,0,0,0.18)',
					}}>
					🗑 {t('arpg.inventory.dropFloor')}
				</div>
			</GothicPanel>
		</div>
	);
}
