// Spell hotbar row sitting just above the item InventoryBar. Renders the
// scene-owned spell loadout (emitted over the HUD event bus) as up-to-9 slots
// keyed by the bare number keys 1-9 that the scene maps to castSpellSlot. Static
// display only — casting is keyboard-driven in the scene; this bar mirrors the
// loadout so the player sees emoji, name, mana, and rarity.

import type { ReactElement } from 'react';
import { useTranslation } from '@kbve/laser';
import { PixelPanel } from '../../PixelPanel';
import { rarityColor, type SpellMeta } from '../../entities/spellMeta';

const ACCENT = '#fcd34d';
const MUTED = '#9fb3d8';
const TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.9)';

function SpellIcon({
	spell,
	size,
}: {
	spell: SpellMeta;
	size: number;
}): ReactElement {
	if (spell.emoji) {
		return (
			<span style={{ fontSize: size, lineHeight: 1 }}>{spell.emoji}</span>
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
			{spell.name.slice(0, 2).toUpperCase()}
		</span>
	);
}

export function SpellBar({
	spells,
}: {
	spells: SpellMeta[];
}): ReactElement | null {
	const { t } = useTranslation();
	if (spells.length === 0) return null;
	const slots = spells.slice(0, 9);
	return (
		<div
			style={{
				position: 'absolute',
				bottom: 78,
				left: '50%',
				transform: 'translateX(-50%)',
				display: 'flex',
				gap: 6,
			}}>
			{slots.map((sp, i) => (
				<PixelPanel
					key={sp.ref}
					variant="slate"
					scale={2}
					title={t('arpg.spells.castTitle', {
						name: sp.name,
						mana: sp.manaCost,
					})}
					style={{
						minWidth: 58,
						padding: '5px 8px 7px',
						textAlign: 'center',
						pointerEvents: 'auto',
					}}>
					<div
						style={{
							fontSize: 9,
							color: ACCENT,
							textShadow: TEXT_SHADOW,
							opacity: 0.85,
						}}>
						{i + 1}
					</div>
					<div
						style={{
							height: 22,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
						}}>
						<SpellIcon spell={sp} size={20} />
					</div>
					<div
						style={{
							fontSize: 9,
							color: rarityColor(sp.rarity),
							textShadow: TEXT_SHADOW,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							maxWidth: 58,
						}}>
						{sp.name}
					</div>
					<div
						style={{
							fontSize: 10,
							fontWeight: 700,
							color: '#60a5fa',
							textShadow: TEXT_SHADOW,
						}}>
						{t('arpg.spells.mana', { mana: sp.manaCost })}
					</div>
				</PixelPanel>
			))}
		</div>
	);
}
