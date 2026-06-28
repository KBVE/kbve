import { useEffect, useState, type ReactElement } from 'react';
import {
	I18nProvider,
	useTranslation,
	PB_DAMAGE,
	PB_FAINT,
	PB_SWAP,
	PB_HEAL,
	PB_STATUS_DMG,
	PET_ACT_MOVE,
	PET_ACT_SWAP,
	PET_ACT_ITEM,
	PET_ACT_RUN,
} from '@kbve/laser';
import type {
	InventoryItem,
	PetBattler,
	PetBattleState,
	PetBattleWireEvent,
	PetMoveOption,
} from '@kbve/laser';
import {
	onHud,
	onHudClear,
	onInventory,
	onInventoryOpen,
	onSpellLoadout,
	onDeath,
	onPetBattleState,
	emitPetBattleRequest,
	emitPetBattleAction,
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
 * Debug-only trigger: a button that starts an interactive 5v5 mechamutt battle. The server
 * streams a PetBattleState each turn; the <PetBattleScene> plays it out and collects the
 * player's choices. Temporary placement — the real encounter flow replaces it later.
 */
function PetBattleDebug() {
	const [state, setState] = useState<PetBattleState | null>(null);
	const [pending, setPending] = useState(false);
	useEffect(() => {
		const off = onPetBattleState((s) => {
			setState(s);
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
				{pending ? '⚔ Starting…' : '⚔ Sim Battle (5v5)'}
			</button>
			{state && (
				<PetBattleScene
					state={state}
					onAction={(action, arg) =>
						emitPetBattleAction({ action, arg })
					}
					onClose={() => setState(null)}
				/>
			)}
		</>
	);
}

const SPRITE_OF = (ref: string) => `/assets/npc/${ref}.png`;
const STEP_MS = 650;

interface BattleView {
	pIdx: number;
	eIdx: number;
	pHp: number;
	eHp: number;
	text: string;
	hitSide: number;
}

function startView(s: PetBattleState): BattleView {
	return {
		pIdx: s.p_active,
		eIdx: s.e_active,
		pHp: s.player[s.p_active]?.hp ?? 0,
		eHp: s.enemy[s.e_active]?.hp ?? 0,
		text: s.events[0]?.text ?? '',
		hitSide: -1,
	};
}

/** Fold one battle event into the running view (HP, active index, current line). */
function applyEvent(
	v: BattleView,
	e: PetBattleWireEvent,
	s: PetBattleState,
): BattleView {
	const next: BattleView = {
		...v,
		text: e.text || v.text,
		hitSide: e.kind === PB_DAMAGE ? e.side : -1,
	};
	if (e.kind === PB_SWAP) {
		if (e.side === 0) {
			next.pIdx = e.value;
			next.pHp = s.player[e.value]?.hp ?? next.pHp;
		} else {
			next.eIdx = e.value;
			next.eHp = s.enemy[e.value]?.hp ?? next.eHp;
		}
	} else if (
		e.kind === PB_DAMAGE ||
		e.kind === PB_STATUS_DMG ||
		e.kind === PB_HEAL
	) {
		if (e.side === 0) next.pHp = e.hp;
		else next.eHp = e.hp;
	} else if (e.kind === PB_FAINT) {
		if (e.side === 0) next.pHp = 0;
		else next.eHp = 0;
	}
	return next;
}

function aliveCount(team: PetBattler[]): number {
	return team.filter((b) => b.hp > 0).length;
}

/**
 * Interactive Pokémon-style battle overlay. Plays the events of each streamed turn (HP
 * tweens, hit shake, faint dim), then — once the server is awaiting — shows the action
 * menu (moves with PP cost, swap, potion, run). The player's pick is sent back as a
 * PetTurn; the next streamed state advances the fight.
 */
function PetBattleScene({
	state,
	onAction,
	onClose,
}: {
	state: PetBattleState;
	onAction: (action: number, arg: number) => void;
	onClose: () => void;
}) {
	const [view, setView] = useState<BattleView>(() => startView(state));
	const [step, setStep] = useState(0);
	const [waiting, setWaiting] = useState(false);
	const [swapOpen, setSwapOpen] = useState(false);

	// A new turn arrived: replay its events from the top (the view's HP carries over from
	// the previous turn, so bars tween continuously).
	useEffect(() => {
		setStep(0);
		setWaiting(false);
		setSwapOpen(false);
	}, [state]);

	// Step through the current turn's events on a timer, folding each into the view.
	useEffect(() => {
		if (step >= state.events.length) return;
		const e = state.events[step];
		setView((v) => applyEvent(v, e, state));
		const t = setTimeout(() => setStep((n) => n + 1), STEP_MS);
		return () => clearTimeout(t);
	}, [step, state]);

	const animating = step < state.events.length;
	const over = state.outcome !== 'Ongoing';
	const showMenu = !animating && state.awaiting && !waiting && !over;

	const commit = (action: number, arg: number) => {
		setWaiting(true);
		setSwapOpen(false);
		onAction(action, arg);
	};

	const pTeam = state.player[view.pIdx];
	const eTeam = state.enemy[view.eIdx];
	const reserves = state.player
		.map((b, i) => ({ b, i }))
		.filter((r) => r.i !== view.pIdx && r.b.hp > 0);

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
					hp={view.eHp}
					alive={aliveCount(state.enemy)}
					total={state.enemy.length}
					shake={view.hitSide === 1}
					foe
				/>
			</div>

			{/* Player: bottom-left */}
			<div style={{ alignSelf: 'flex-start' }}>
				<Battler
					battler={pTeam}
					hp={view.pHp}
					alive={aliveCount(state.player)}
					total={state.player.length}
					shake={view.hitSide === 0}
				/>
			</div>

			{/* Text box + action menu */}
			<div
				style={{
					pointerEvents: 'auto',
					border: '2px solid #6ea8ff',
					borderRadius: 10,
					background: 'rgba(8,10,16,0.92)',
					padding: '12px 16px',
					minHeight: 56,
					display: 'flex',
					flexDirection: 'column',
					gap: 10,
				}}>
				<span style={{ fontSize: 14, minHeight: 20 }}>
					{over
						? `Battle over — ${outcomeLabel(state.outcome)}`
						: view.text}
				</span>
				{over ? (
					<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
						<BattleButton label="Close ✕" onClick={onClose} />
					</div>
				) : showMenu ? (
					<div
						style={{
							display: 'flex',
							flexWrap: 'wrap',
							gap: 8,
						}}>
						{swapOpen ? (
							<>
								{reserves.length === 0 && (
									<span style={{ color: MUTED, fontSize: 12 }}>
										No reserves left.
									</span>
								)}
								{reserves.map((r) => (
									<BattleButton
										key={r.i}
										label={`${r.b.nickname} (${r.b.hp}/${r.b.max_hp})`}
										onClick={() => commit(PET_ACT_SWAP, r.i)}
									/>
								))}
								<BattleButton
									label="↩ Back"
									onClick={() => setSwapOpen(false)}
								/>
							</>
						) : (
							<>
								{state.moves.map((m) => (
									<MoveButton
										key={m.slot}
										move={m}
										onClick={() =>
											commit(PET_ACT_MOVE, m.slot)
										}
									/>
								))}
								<BattleButton
									label="⇄ Swap"
									onClick={() => setSwapOpen(true)}
								/>
								<BattleButton
									label="🧪 Potion"
									onClick={() => commit(PET_ACT_ITEM, 0)}
								/>
								{state.can_run && (
									<BattleButton
										label="🏃 Run"
										onClick={() => commit(PET_ACT_RUN, 0)}
									/>
								)}
							</>
						)}
					</div>
				) : (
					<span style={{ color: MUTED, fontSize: 12 }}>
						{waiting ? 'Resolving…' : '…'}
					</span>
				)}
			</div>
		</div>
	);
}

/** A move choice button: name + remaining PP (the cost), with element/power/accuracy in
 * the tooltip. Disabled when the move is out of PP. */
function MoveButton({
	move,
	onClick,
}: {
	move: PetMoveOption;
	onClick: () => void;
}) {
	const dead = move.pp <= 0;
	return (
		<button
			type="button"
			disabled={dead}
			onClick={onClick}
			title={`${move.element} · power ${move.power} · acc ${move.accuracy > 100 ? '∞' : `${move.accuracy}%`}`}
			style={{
				padding: '6px 12px',
				fontFamily: 'monospace',
				fontSize: 12,
				color: '#e6ebf5',
				background: 'rgba(40,20,60,0.85)',
				border: '1px solid #6ea8ff',
				borderRadius: 6,
				opacity: dead ? 0.4 : 1,
				cursor: dead ? 'not-allowed' : 'pointer',
			}}>
			<span>{move.name}</span>
			<span style={{ color: MUTED, marginLeft: 8 }}>
				PP {move.pp}/{move.max_pp}
			</span>
		</button>
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
