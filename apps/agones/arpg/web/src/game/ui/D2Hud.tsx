import { useEffect, useState, type ReactElement } from 'react';
import {
	I18nProvider,
	useTranslation,
	PB_DAMAGE,
	PB_FAINT,
	PB_SWAP,
	PB_HEAL,
	PB_STATUS_DMG,
} from '@kbve/laser';
import type { InventoryItem, PetBattleReplay, PetBattler } from '@kbve/laser';
import {
	onHud,
	onHudClear,
	onInventory,
	onInventoryOpen,
	onSpellLoadout,
	onDeath,
	onPetBattleReplay,
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
 * Debug-only trigger: a button that asks the server to simulate a 5v5 mechamutt battle;
 * when the replay streams back it opens the animated <PetBattleScene>. Temporary
 * placement (top-left) — the real encounter flow replaces it later.
 */
function PetBattleDebug() {
	const [replay, setReplay] = useState<PetBattleReplay | null>(null);
	const [pending, setPending] = useState(false);
	useEffect(() => {
		const off = onPetBattleReplay((r) => {
			setReplay(r);
			setPending(false);
		});
		return () => off();
	}, []);
	return (
		<>
			<button
				type="button"
				onClick={() => {
					setPending(true);
					emitPetBattleRequest();
				}}
				style={{
					position: 'absolute',
					top: 64,
					left: 14,
					pointerEvents: 'auto',
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
			{replay && (
				<PetBattleScene
					replay={replay}
					onClose={() => setReplay(null)}
				/>
			)}
		</>
	);
}

const SPRITE_OF = (ref: string) => `/assets/npc/${ref}.png`;
const STEP_MS = 650;

interface BattleView {
	pa: number;
	ea: number;
	pHp: number;
	eHp: number;
	pFaint: number;
	eFaint: number;
	text: string;
	hitSide: number;
}

/** Fold the replay events up to `upto` into the visible battle state. */
function viewAt(replay: PetBattleReplay, upto: number): BattleView {
	let pa = 0;
	let ea = 0;
	let pHp = replay.player[0]?.hp ?? 0;
	let eHp = replay.enemy[0]?.hp ?? 0;
	let pFaint = 0;
	let eFaint = 0;
	for (let i = 0; i <= upto && i < replay.events.length; i++) {
		const e = replay.events[i];
		if (e.kind === PB_SWAP) {
			if (e.side === 0) {
				pa = e.value;
				pHp = replay.player[pa]?.max_hp ?? pHp;
			} else {
				ea = e.value;
				eHp = replay.enemy[ea]?.max_hp ?? eHp;
			}
		} else if (
			e.kind === PB_DAMAGE ||
			e.kind === PB_STATUS_DMG ||
			e.kind === PB_HEAL
		) {
			if (e.side === 0) pHp = e.hp;
			else eHp = e.hp;
		} else if (e.kind === PB_FAINT) {
			if (e.side === 0) {
				pHp = 0;
				pFaint += 1;
			} else {
				eHp = 0;
				eFaint += 1;
			}
		}
	}
	const last = replay.events[Math.min(upto, replay.events.length - 1)];
	return {
		pa,
		ea,
		pHp,
		eHp,
		pFaint,
		eFaint,
		text: last?.text ?? '',
		hitSide: last?.kind === PB_DAMAGE ? last.side : -1,
	};
}

/**
 * Animated Pokémon-style battle overlay: steps through the streamed replay event by
 * event, tweening HP bars, shaking the struck pet, and dimming fainted reserves. A
 * stand-in scene — the visuals can grow, but the data path is the real one.
 */
function PetBattleScene({
	replay,
	onClose,
}: {
	replay: PetBattleReplay;
	onClose: () => void;
}) {
	const [step, setStep] = useState(0);
	const last = replay.events.length - 1;
	useEffect(() => {
		if (step >= last) return;
		const t = setTimeout(
			() => setStep((s) => Math.min(s + 1, last)),
			STEP_MS,
		);
		return () => clearTimeout(t);
	}, [step, last]);

	const v = viewAt(replay, step);
	const done = step >= last;
	const empty = replay.events.length === 0;
	const pTeam = replay.player[v.pa];
	const eTeam = replay.enemy[v.ea];

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				pointerEvents: 'auto',
				zIndex: 40,
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'space-between',
				padding: 24,
				fontFamily: 'monospace',
				color: '#e6ebf5',
				background:
					'radial-gradient(ellipse at center, rgba(20,28,48,0.92), rgba(4,6,12,0.97))',
			}}>
			<style>
				{
					'@keyframes arpgHitShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}'
				}
			</style>
			{/* Enemy: top-right */}
			<div style={{ alignSelf: 'flex-end' }}>
				<Battler
					battler={eTeam}
					hp={v.eHp}
					alive={replay.enemy.length - v.eFaint}
					total={replay.enemy.length}
					shake={v.hitSide === 1}
					foe
				/>
			</div>

			{/* Player: bottom-left */}
			<div style={{ alignSelf: 'flex-start' }}>
				<Battler
					battler={pTeam}
					hp={v.pHp}
					alive={replay.player.length - v.pFaint}
					total={replay.player.length}
					shake={v.hitSide === 0}
				/>
			</div>

			{/* Text box + controls */}
			<div
				style={{
					pointerEvents: 'auto',
					border: '2px solid #6ea8ff',
					borderRadius: 10,
					background: 'rgba(8,10,16,0.92)',
					padding: '12px 16px',
					minHeight: 56,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 12,
				}}>
				<span style={{ fontSize: 14 }}>
					{empty
						? 'No battle data received — the server may be out of date.'
						: done
							? `Battle over — ${outcomeLabel(replay.outcome)}`
							: v.text}
				</span>
				<span style={{ display: 'flex', gap: 8 }}>
					{!done && !empty && (
						<BattleButton
							label="Skip ▶▶"
							onClick={() => setStep(last)}
						/>
					)}
					{done && <BattleButton label="Close ✕" onClick={onClose} />}
				</span>
			</div>
		</div>
	);
}

function outcomeLabel(outcome: string): string {
	if (outcome === 'PlayerWon') return 'You won! 🏆';
	if (outcome === 'PlayerLost') return 'You lost…';
	if (outcome === 'Fled') return 'Got away safely.';
	return outcome;
}

function Battler({
	battler,
	hp,
	alive,
	total,
	shake,
	foe = false,
}: {
	battler: PetBattler | undefined;
	hp: number;
	alive: number;
	total: number;
	shake: boolean;
	foe?: boolean;
}) {
	const [imgBroken, setImgBroken] = useState(false);
	if (!battler) return null;
	const pct = Math.max(
		0,
		Math.min(100, (hp / Math.max(1, battler.max_hp)) * 100),
	);
	const barColor = pct > 50 ? '#22c55e' : pct > 20 ? '#eab308' : '#ef4444';
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: foe ? 'row' : 'row-reverse',
				alignItems: 'center',
				gap: 14,
			}}>
			<span
				key={shake ? `hit-${hp}` : `idle-${hp}`}
				style={{
					display: 'inline-block',
					animation: shake ? 'arpgHitShake 0.3s ease' : 'none',
				}}>
				{imgBroken ? (
					<span
						aria-label={battler.nickname}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: 96,
							height: 96,
							fontSize: 40,
							borderRadius: 12,
							background: 'rgba(110,168,255,0.12)',
							border: '1px dashed #6ea8ff',
							filter:
								hp <= 0 ? 'grayscale(1) brightness(0.5)' : 'none',
						}}>
						🐾
					</span>
				) : (
					<img
						src={SPRITE_OF(battler.species_ref)}
						alt={battler.nickname}
						width={96}
						height={96}
						onError={() => setImgBroken(true)}
						style={{
							imageRendering: 'pixelated',
							transform: foe ? 'scaleX(-1)' : 'none',
							filter:
								hp <= 0 ? 'grayscale(1) brightness(0.5)' : 'none',
						}}
					/>
				)}
			</span>
			<div style={{ minWidth: 180 }}>
				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						fontSize: 12,
					}}>
					<span>{battler.nickname}</span>
					<span style={{ color: MUTED }}>Lv {battler.level}</span>
				</div>
				<div
					style={{
						height: 8,
						borderRadius: 4,
						background: 'rgba(255,255,255,0.12)',
						overflow: 'hidden',
						margin: '4px 0',
					}}>
					<div
						style={{
							height: '100%',
							width: `${pct}%`,
							background: barColor,
							transition:
								'width 0.35s ease, background 0.35s ease',
						}}
					/>
				</div>
				<div style={{ display: 'flex', gap: 4, fontSize: 11 }}>
					<span style={{ color: MUTED }}>
						{Math.max(0, hp)}/{battler.max_hp}
					</span>
					<span style={{ marginLeft: 'auto', letterSpacing: 2 }}>
						{'●'.repeat(Math.max(0, alive))}
						<span style={{ color: '#3a4a66' }}>
							{'●'.repeat(Math.max(0, total - alive))}
						</span>
					</span>
				</div>
			</div>
		</div>
	);
}

function BattleButton({
	label,
	onClick,
}: {
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				padding: '6px 12px',
				fontFamily: 'monospace',
				fontSize: 12,
				color: '#e6ebf5',
				background: 'rgba(40,20,60,0.85)',
				border: '1px solid #6ea8ff',
				borderRadius: 6,
				cursor: 'pointer',
			}}>
			{label}
		</button>
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
