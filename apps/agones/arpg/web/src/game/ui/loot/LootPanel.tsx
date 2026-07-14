import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from '@kbve/laser';
import type { InventoryItem, CorpseContents } from '@kbve/laser';
import { emitCorpseIntent, onCorpseOpen, onHudClear } from '../../systems/hud';
import { type ItemMeta } from '../../entities/itemMeta';
import { ItemIcon } from '../inventory/Inventory';
import {
	GothicPanel,
	GothicSlot,
	GothicTitleBar,
	GothicDivider,
	GothicButton,
	GothicCloseButton,
	useMountTransition,
} from '../gothic/Gothic';

const ACCENT = '#fcd34d';
const MUTED = '#9fb3d8';
const TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.9)';

const COLS = 4;
const ROWS = 5;

/** A single inventory grid: corpse side is click-to-take, player side is read-only. */
function LootGrid({
	items,
	meta,
	onTake,
}: {
	items: InventoryItem[];
	meta: Map<string, ItemMeta>;
	onTake?: (slot: number) => void;
}): ReactElement {
	const slotCount = COLS * ROWS;
	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: `repeat(${COLS}, 1fr)`,
				gap: 5,
			}}>
			{Array.from({ length: slotCount }, (_, i) => {
				const it = items[i];
				const m = it ? meta.get(it.ref) : undefined;
				return (
					<GothicSlot
						key={i}
						title={it ? (m?.name ?? it.ref) : undefined}
						onClick={() => {
							if (it && onTake) onTake(i);
						}}
						style={{
							cursor: it && onTake ? 'pointer' : 'default',
						}}>
						{it && (
							<>
								<ItemIcon meta={m} itemRef={it.ref} size={30} />
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
	);
}

/**
 * Dual-inventory corpse loot panel. The scene forwards the server's `corpse`
 * event (CorpseContents) via CORPSE_OPEN; this shows the corpse's items on the
 * left (click a slot to take it — server re-sends updated contents) and the
 * looter's own inventory on the right. "Take All" loots everything; closing or
 * an empty contents push (corpse despawned) tears it down. Esc closes too.
 */
export function LootPanel({
	items,
	meta,
}: {
	items: InventoryItem[];
	meta: Map<string, ItemMeta>;
}): ReactElement | null {
	const { t } = useTranslation();
	const [corpse, setCorpse] = useState<number | null>(null);
	const [loot, setLoot] = useState<InventoryItem[]>([]);
	const open = corpse !== null;
	const { mounted, shown } = useMountTransition(open, 200);

	const close = () => {
		if (corpse !== null) emitCorpseIntent({ type: 'close' });
		setCorpse(null);
		setLoot([]);
	};

	useEffect(() => {
		const off = onCorpseOpen((c: CorpseContents) => {
			// Empty push means the corpse was fully looted + despawned: close.
			if (c.items.length === 0) {
				setCorpse(null);
				setLoot([]);
				return;
			}
			setCorpse(c.corpse);
			setLoot(c.items.map(([ref, count]) => ({ ref, count })));
		});
		const offClear = onHudClear(() => {
			setCorpse(null);
			setLoot([]);
		});
		return () => {
			off();
			offClear();
		};
	}, []);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, corpse]);

	if (!mounted) return null;

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				pointerEvents: shown ? 'auto' : 'none',
				background: shown ? 'rgba(2,3,6,0.55)' : 'rgba(2,3,6,0)',
				transition: 'background 0.2s ease',
			}}>
			<GothicPanel
				padding={18}
				style={{
					position: 'relative',
					width: 520,
					filter: 'drop-shadow(0 14px 40px rgba(0,0,0,0.6))',
					transformOrigin: 'center',
					transform: shown ? 'scale(1)' : 'scale(0.9)',
					opacity: shown ? 1 : 0,
					transition:
						'transform 0.2s cubic-bezier(0.2,0.8,0.3,1.1), opacity 0.2s ease',
				}}>
				<GothicCloseButton
					size={32}
					onClick={close}
					style={{
						position: 'absolute',
						top: -16,
						right: -16,
						zIndex: 1,
					}}
				/>
				<GothicTitleBar style={{ marginBottom: 12 }}>
					{t('arpg.loot.title')}
				</GothicTitleBar>

				<div
					style={{
						display: 'grid',
						gridTemplateColumns: '1fr 1fr',
						gap: 16,
					}}>
					<div>
						<ColLabel>{t('arpg.loot.corpse')}</ColLabel>
						<LootGrid
							items={loot}
							meta={meta}
							onTake={(slot) => {
								if (corpse !== null)
									emitCorpseIntent({
										type: 'take',
										corpse,
										slot,
									});
							}}
						/>
					</div>
					<div>
						<ColLabel>{t('arpg.loot.you')}</ColLabel>
						<LootGrid items={items} meta={meta} />
					</div>
				</div>

				<GothicDivider style={{ margin: '12px 0 8px' }} />

				<div style={{ display: 'flex', justifyContent: 'center' }}>
					<GothicButton
						onClick={() => {
							if (corpse !== null)
								emitCorpseIntent({ type: 'all', corpse });
						}}>
						{t('arpg.loot.takeAll')}
					</GothicButton>
				</div>
			</GothicPanel>
		</div>
	);
}

function ColLabel({ children }: { children: string }): ReactElement {
	return (
		<div
			style={{
				marginBottom: 8,
				textAlign: 'center',
				fontSize: 11,
				fontWeight: 700,
				letterSpacing: 1,
				color: MUTED,
				textShadow: TEXT_SHADOW,
			}}>
			{children}
		</div>
	);
}
