import { useEffect, useState, type ReactElement } from 'react';
import { I18nProvider, useTranslation } from '@kbve/laser';
import type { InventoryItem, PetBattleLog } from '@kbve/laser';
import {
	onHud,
	onHudClear,
	onInventory,
	onInventoryOpen,
	onSpellLoadout,
	onDeath,
	onPetBattleLog,
	emitPetBattleRequest,
	type HudState,
} from '../systems/hud';
import { loadItemMeta, type ItemMeta } from '../entities/itemMeta';
import type { SpellMeta } from '../entities/spellMeta';
import { HotBar } from './hotbar/HotBar';
import { registerArpgI18n } from './i18n';
import { StatOrb, useWavePhase, type OrbStat } from './orbs/StatOrb';
import { GothicOrbRing, ORB_FRAME_HOLE } from './gothic/Gothic';
import { Minimap } from './minimap/Minimap';
import { Tooltip } from './Tooltip';
import { InventoryPanel, useInventoryDnd } from './inventory/Inventory';
import { LootPanel } from './loot/LootPanel';

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
					<HotBar spells={spells} items={inv} meta={meta} dnd={dnd} />
					<InventoryPanel
						open={open}
						items={inv}
						meta={meta}
						dnd={dnd}
					/>
					<LootPanel items={inv} meta={meta} />
					{debug && <DebugReadout fps={hud.fps} tile={hud.tile} />}
				</>
			)}
			<Tooltip />
			<DeathScreen />
			{debug && <PetBattleDebug />}
		</div>
	);
}

/**
 * Debug-only: a button that asks the server to simulate a 5v5 mechamutt battle, plus
 * a scrollable panel that renders the streamed turn log. Temporary placement (top-left);
 * the real encounter UI replaces it later.
 */
function PetBattleDebug() {
	const [log, setLog] = useState<PetBattleLog | null>(null);
	const [pending, setPending] = useState(false);
	useEffect(() => {
		const off = onPetBattleLog((l) => {
			setLog(l);
			setPending(false);
		});
		return () => off();
	}, []);
	return (
		<div
			style={{
				position: 'absolute',
				top: 64,
				left: 14,
				pointerEvents: 'auto',
				display: 'flex',
				flexDirection: 'column',
				gap: 6,
				maxWidth: 320,
			}}>
			<button
				type="button"
				onClick={() => {
					setPending(true);
					emitPetBattleRequest();
				}}
				style={{
					alignSelf: 'flex-start',
					padding: '6px 12px',
					fontFamily: 'monospace',
					fontSize: 12,
					color: '#e6ebf5',
					background: 'rgba(40,20,60,0.85)',
					border: '1px solid #6ea8ff',
					borderRadius: 6,
					cursor: 'pointer',
					textShadow: TEXT_SHADOW,
				}}>
				{pending ? '⚔ Simulating…' : '⚔ Sim Battle (5v5)'}
			</button>
			{log && (
				<div
					style={{
						maxHeight: 280,
						overflowY: 'auto',
						padding: '8px 10px',
						fontFamily: 'monospace',
						fontSize: 11,
						lineHeight: 1.5,
						color: '#c7f9cc',
						background: 'rgba(8,10,16,0.9)',
						border: '1px solid #2b3a55',
						borderRadius: 6,
					}}>
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							marginBottom: 4,
							color: MUTED,
						}}>
						<span>Battle log</span>
						<span
							onClick={() => setLog(null)}
							style={{ cursor: 'pointer' }}>
							✕
						</span>
					</div>
					{log.lines.map((line, i) => (
						<div key={i}>{line}</div>
					))}
				</div>
			)}
		</div>
	);
}

/**
 * Brief "You Died" overlay on local death. Death is server-instant (respawn next
 * tick), so it's triggered by the DEATH event, not a sustained hp=0; it fades
 * itself out after a few seconds.
 */
function DeathScreen() {
	const [shown, setShown] = useState(false);
	useEffect(() => {
		let t: ReturnType<typeof setTimeout> | undefined;
		const off = onDeath(() => {
			setShown(true);
			if (t) clearTimeout(t);
			t = setTimeout(() => setShown(false), 3600);
		});
		return () => {
			off();
			if (t) clearTimeout(t);
		};
	}, []);
	if (!shown) return null;
	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 10,
				background:
					'radial-gradient(ellipse at center, rgba(60,0,0,0.35), rgba(0,0,0,0.82))',
				zIndex: 35,
				pointerEvents: 'none',
				animation: 'arpgDeathFade 0.5s ease',
			}}>
			<div
				style={{
					fontFamily: 'serif',
					fontSize: 64,
					fontWeight: 700,
					letterSpacing: 4,
					color: '#b91c1c',
					textShadow: '0 2px 12px rgba(0,0,0,0.9)',
				}}>
				YOU DIED
			</div>
			<div
				style={{
					fontSize: 14,
					color: '#cbb4a0',
					textShadow: TEXT_SHADOW,
				}}>
				Your corpse holds your belongings. Respawned at the surface —
				find your way back.
			</div>
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
	const RING = 84;
	const ORB = Math.round(RING * ORB_FRAME_HOLE);
	return (
		<div
			style={{
				position: 'absolute',
				bottom: 14,
				[corner]: 14,
				display: 'flex',
				flexDirection: 'row',
				gap: 2,
			}}>
			{orbs.map((o, i) => (
				<GothicOrbRing key={o.key} size={RING}>
					<StatOrb stat={o} phase={phase + i * 1.7} size={ORB} />
				</GothicOrbRing>
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
