import { useEffect, useState, type ReactElement } from 'react';
import { I18nProvider, useTranslation } from '@kbve/laser';
import type { InventoryItem } from '@kbve/laser';
import {
	onHud,
	onHudClear,
	onInventory,
	onInventoryOpen,
	onSpellLoadout,
	type HudState,
} from '../systems/hud';
import { loadItemMeta, type ItemMeta } from '../entities/itemMeta';
import type { SpellMeta } from '../entities/spellMeta';
import { SpellBar } from './spells/SpellBar';
import { registerArpgI18n } from './i18n';
import { StatOrb, useWavePhase, type OrbStat } from './orbs/StatOrb';
import { Minimap } from './minimap/Minimap';
import { Tooltip } from './Tooltip';
import {
	InventoryBar,
	InventoryPanel,
	useInventoryDnd,
} from './inventory/Inventory';

const MUTED = '#9fb3d8';
const TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.9)';

registerArpgI18n();

function useItemMeta(): Map<string, ItemMeta> {
	const [meta, setMeta] = useState<Map<string, ItemMeta>>(() => new Map());
	useEffect(() => {
		let alive = true;
		void loadItemMeta().then((m) => {
			if (alive) setMeta(m);
		});
		return () => {
			alive = false;
		};
	}, []);
	return meta;
}

/**
 * Diablo II-style HUD: HP/MP orb globes anchored bottom-left, EP/SP globes
 * bottom-right, inventory hotbar centered between them, a translucent round
 * minimap top-right, and the compass bottom-center. All strings flow through
 * the shared @kbve/laser i18n store.
 */
export default function D2Hud({ debug = false }: { debug?: boolean }) {
	return (
		<I18nProvider>
			<D2HudInner debug={debug} />
		</I18nProvider>
	);
}

function D2HudInner({ debug }: { debug: boolean }) {
	const [hud, setHud] = useState<HudState | null>(null);
	const [inv, setInv] = useState<InventoryItem[]>([]);
	const [spells, setSpells] = useState<SpellMeta[]>([]);
	const [open, setOpen] = useState(false);
	const meta = useItemMeta();
	const dnd = useInventoryDnd(inv.length);

	useEffect(() => {
		const off = onHud(setHud);
		const offInv = onInventory(setInv);
		const offSpells = onSpellLoadout(setSpells);
		const offOpen = onInventoryOpen(setOpen);
		const offClear = onHudClear(() => {
			setHud(null);
			setInv([]);
			setSpells([]);
			setOpen(false);
		});
		return () => {
			off();
			offInv();
			offSpells();
			offOpen();
			offClear();
		};
	}, []);

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				pointerEvents: 'none',
				fontFamily: 'monospace',
				color: '#e6ebf5',
				zIndex: 15,
				overflow: 'hidden',
			}}>
			{hud && (
				<>
					<OrbFlank
						corner="left"
						orbs={[
							orb('hp', hud.hp, hud.maxHp, [
								'#fb7185',
								'#ef4444',
								'#7f1d1d',
							]),
							orb('mp', hud.mp, hud.maxMp, [
								'#60a5fa',
								'#3b82f6',
								'#1e3a8a',
							]),
						]}
					/>
					<OrbFlank
						corner="right"
						orbs={[
							orb('ep', hud.ep, hud.maxEp, [
								'#fde047',
								'#eab308',
								'#854d0e',
							]),
							orb('sp', hud.sp, hud.maxSp, [
								'#4ade80',
								'#22c55e',
								'#14532d',
							]),
						]}
					/>
					<div
						style={{
							position: 'absolute',
							top: 14,
							right: 14,
						}}>
						<Minimap
							map={hud.map}
							tile={hud.tile}
							headingDeg={hud.headingDeg}
						/>
					</div>
					<SpellBar spells={spells} />
					<InventoryBar items={inv} meta={meta} dnd={dnd} />
					{open && (
						<InventoryPanel items={inv} meta={meta} dnd={dnd} />
					)}
					{debug && <DebugReadout fps={hud.fps} tile={hud.tile} />}
				</>
			)}
			<Tooltip />
		</div>
	);
}

function orb(
	key: OrbStat['key'],
	cur: number,
	max: number,
	fluid: [string, string, string],
): OrbStat {
	return { key, cur, max, fluid };
}

/** A bottom-corner pair of orbs flanking the screen edge, D2-style. */
function OrbFlank({
	corner,
	orbs,
}: {
	corner: 'left' | 'right';
	orbs: OrbStat[];
}) {
	const phase = useWavePhase();
	return (
		<div
			style={{
				position: 'absolute',
				bottom: 14,
				[corner]: 14,
				display: 'flex',
				flexDirection: 'row',
				gap: 4,
			}}>
			{orbs.map((o, i) => (
				<StatOrb key={o.key} stat={o} phase={phase + i * 1.7} />
			))}
		</div>
	);
}

function DebugReadout({
	fps,
	tile,
}: {
	fps: number;
	tile: { x: number; y: number };
}): ReactElement {
	const { t } = useTranslation();
	return (
		<div
			style={{
				position: 'absolute',
				top: 14,
				left: 14,
				padding: '5px 9px',
				fontSize: 10,
				lineHeight: 1.6,
				color: MUTED,
				textShadow: TEXT_SHADOW,
				background: 'rgba(10,13,20,0.4)',
				borderRadius: 4,
			}}>
			<div>{t('arpg.debug.fps', { fps })}</div>
			<div>{t('arpg.debug.tile', { x: tile.x, y: tile.y })}</div>
		</div>
	);
}
