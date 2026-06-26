import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from '@kbve/laser';
import type { InventoryItem } from '@kbve/laser';
import { emitInventoryIntent } from '../../systems/hud';
import { rarityColor, type ItemMeta } from '../../entities/itemMeta';
import type { SpellMeta } from '../../entities/spellMeta';
import { GothicSlot } from '../gothic/Gothic';
import { ItemIcon, type InventoryDnd } from '../inventory/Inventory';

const SLOT = 46;
const SLOTS = 9;
const ACCENT = '#fcd34d';
const MANA = '#60a5fa';
const TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.9)';

// Unified action bar: two neatly-stacked rows of nine gothic slots — spells on
// the bare 1-9 keys, items on Shift+1-9 — mirroring the inventory's slot chrome.
// Both rows always render all nine slots so the bar never shifts as the loadout
// or inventory fills.
export function HotBar({
	spells,
	items,
	meta,
	dnd,
}: {
	spells: SpellMeta[];
	items: InventoryItem[];
	meta: Map<string, ItemMeta>;
	dnd: InventoryDnd;
}): ReactElement {
	const { t } = useTranslation();

	return (
		<div
			style={{
				position: 'absolute',
				bottom: 14,
				left: '50%',
				transform: 'translateX(-50%)',
				display: 'flex',
				flexDirection: 'column',
				gap: 5,
				alignItems: 'center',
				pointerEvents: 'none',
			}}>
			{/* Item row — Shift+1-9 */}
			<div style={{ display: 'flex', gap: 4 }}>
				{Array.from({ length: SLOTS }, (_, i) => {
					const it = items[i];
					const m = it ? meta.get(it.ref) : undefined;
					const slot = dnd.slotProps(i, !!it);
					return (
						<HotSlot
							key={`i${i}`}
							keyLabel={`⇧${i + 1}`}
							title={
								it
									? t('arpg.inventory.useTitle', {
											name: m?.name ?? it.ref,
										})
									: undefined
							}
							interactive
							draggable={slot.draggable}
							onDragStart={slot.onDragStart}
							onDragOver={slot.onDragOver}
							onDrop={slot.onDrop}
							onClick={() =>
								it &&
								emitInventoryIntent({ type: 'use', index: i })
							}
							dragging={dnd.drag === i}
							badge={
								it && it.count > 1 ? (
									<Badge color={ACCENT}>{it.count}</Badge>
								) : null
							}>
							{it && (
								<ItemIcon meta={m} itemRef={it.ref} size={26} />
							)}
						</HotSlot>
					);
				})}
			</div>

			{/* Spell row — 1-9 */}
			<div style={{ display: 'flex', gap: 4 }}>
				{Array.from({ length: SLOTS }, (_, i) => {
					const sp = spells[i];
					return (
						<HotSlot
							key={`s${i}`}
							keyLabel={`${i + 1}`}
							title={
								sp
									? t('arpg.spells.castTitle', {
											name: sp.name,
											mana: sp.manaCost,
										})
									: undefined
							}
							badge={
								sp ? (
									<Badge color={MANA}>{sp.manaCost}</Badge>
								) : null
							}>
							{sp && <SpellIcon spell={sp} />}
						</HotSlot>
					);
				})}
			</div>
		</div>
	);
}

function HotSlot({
	keyLabel,
	title,
	children,
	badge,
	interactive = false,
	dragging = false,
	onClick,
	draggable,
	onDragStart,
	onDragOver,
	onDrop,
}: {
	keyLabel: string;
	title?: string;
	children?: ReactNode;
	badge?: ReactNode;
	interactive?: boolean;
	dragging?: boolean;
	onClick?: () => void;
	draggable?: boolean;
	onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
	onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
	onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
}): ReactElement {
	return (
		<GothicSlot
			size={SLOT}
			title={title}
			draggable={draggable}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onClick={onClick}
			style={{
				pointerEvents: 'auto',
				cursor: interactive && children ? 'grab' : 'default',
				opacity: dragging ? 0.4 : 1,
			}}>
			<span
				style={{
					position: 'absolute',
					top: 2,
					left: 3,
					fontSize: 9,
					fontWeight: 700,
					color: ACCENT,
					textShadow: TEXT_SHADOW,
					opacity: 0.9,
					pointerEvents: 'none',
				}}>
				{keyLabel}
			</span>
			{children}
			{badge}
		</GothicSlot>
	);
}

function Badge({
	color,
	children,
}: {
	color: string;
	children: ReactNode;
}): ReactElement {
	return (
		<span
			style={{
				position: 'absolute',
				right: 3,
				bottom: 2,
				fontSize: 9,
				fontWeight: 700,
				color,
				textShadow: TEXT_SHADOW,
				pointerEvents: 'none',
			}}>
			{children}
		</span>
	);
}

function SpellIcon({ spell }: { spell: SpellMeta }): ReactElement {
	if (spell.emoji) {
		return (
			<span style={{ fontSize: 24, lineHeight: 1 }}>{spell.emoji}</span>
		);
	}
	return (
		<span
			style={{
				fontSize: 13,
				fontWeight: 700,
				color: rarityColor(spell.rarity),
				textShadow: TEXT_SHADOW,
			}}>
			{spell.name.slice(0, 2).toUpperCase()}
		</span>
	);
}
