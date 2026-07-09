import {
	useEffect,
	useRef,
	useState,
	type ReactElement,
	type Ref,
} from 'react';
import {
	I18nProvider,
	useTranslation,
	PB_USED,
	PB_DAMAGE,
	PB_FAINT,
	PB_SWAP,
	PB_HEAL,
	PB_STATUS_DMG,
	ELEMENT_NAMES,
	PB_USED_RANGED,
	PB_USED_CATEGORY_MASK,
	PET_ACT_MOVE,
	PET_ACT_SWAP,
	PET_ACT_ITEM,
	PET_ACT_RUN,
	DUEL_PROMPT_OFFER,
	DUEL_PROMPT_DECLINED,
	DUEL_PROMPT_EXPIRED,
	DUEL_PROMPT_ACCEPTED,
	DUEL_PROMPT_SENT,
} from '@kbve/laser';
import type {
	InventoryItem,
	PetBattler,
	PetBattleState,
	PetBattleWireEvent,
	PetMoveOption,
	DuelPrompt,
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
	emitBattleEnter,
	emitBattleExit,
	onBattleEnter,
	onBattleExit,
	onDuelPrompt,
	emitDuelRespond,
	emitNotification,
	type HudState,
} from '../systems/hud';
import { arpgAsset } from '../config';
import { loadItemMeta, type ItemMeta } from '../entities/itemMeta';
import type { SpellMeta } from '../entities/spellMeta';
import { BattleFx, elementStyle } from './battleFx';
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
			<DuelPromptOverlay />
			<PetBattleOverlay />
			{debug && <PetBattleDebug />}
		</div>
	);
}

/**
 * PvP duel challenge prompt: shown to the target on a DUEL_PROMPT_OFFER, with a
 * countdown bar to `deadline_ms` (wall clock, anchored on receipt). Accept opens
 * the battle overlay via the normal petBattleState flow; Decline just closes.
 * The challenger only ever gets passive toasts (sent/declined/expired/accepted)
 * for the other status codes — they never see the interactive overlay themselves.
 *
 * DuelPrompt carries no role field, so EXPIRED (and in theory ACCEPTED) can reach
 * either side: if an OFFER prompt is currently open, this client is the target and
 * the terminal status just closes it silently; otherwise it's the challenger and
 * gets the toast.
 */
function DuelPromptOverlay() {
	const [prompt, setPrompt] = useState<DuelPrompt | null>(null);
	const [anchor, setAnchor] = useState(0);
	const [, setTick] = useState(0);
	const promptOpenRef = useRef(false);

	useEffect(() => {
		const off = onDuelPrompt((p) => {
			if (p.status === DUEL_PROMPT_OFFER) {
				promptOpenRef.current = true;
				setPrompt(p);
				setAnchor(Date.now());
				return;
			}
			if (p.status === DUEL_PROMPT_SENT) {
				emitNotification({
					title: '',
					message: `Challenge sent to ${p.other_name}`,
				});
				return;
			}
			const wasOpen = promptOpenRef.current;
			promptOpenRef.current = false;
			setPrompt(null);
			if (wasOpen) return;
			if (p.status === DUEL_PROMPT_DECLINED) {
				emitNotification({
					title: '',
					message: `${p.other_name} declined`,
				});
			} else if (p.status === DUEL_PROMPT_EXPIRED) {
				emitNotification({ title: '', message: 'Challenge expired' });
			} else if (p.status === DUEL_PROMPT_ACCEPTED) {
				emitNotification({
					title: '',
					message: `${p.other_name} accepted`,
				});
				emitBattleEnter({ kind: 'pet' });
			}
		});
		return () => off();
	}, []);

	useEffect(() => {
		if (!prompt) return;
		const t = setInterval(() => setTick((n) => n + 1), 250);
		return () => clearInterval(t);
	}, [prompt]);

	const remaining = prompt
		? Math.max(0, prompt.deadline_ms - (Date.now() - anchor))
		: 0;

	useEffect(() => {
		if (prompt && remaining <= 0) {
			promptOpenRef.current = false;
			setPrompt(null);
		}
	}, [prompt, remaining]);

	if (!prompt || remaining <= 0) return null;

	const pct = Math.max(
		0,
		Math.min(100, (remaining / prompt.deadline_ms) * 100),
	);

	const respond = (accept: boolean) => {
		emitDuelRespond(accept);
		if (accept) emitBattleEnter({ kind: 'pet' });
		promptOpenRef.current = false;
		setPrompt(null);
	};

	return (
		<div
			style={{
				position: 'absolute',
				top: 100,
				left: '50%',
				transform: 'translateX(-50%)',
				pointerEvents: 'auto',
				zIndex: 30,
				display: 'flex',
				flexDirection: 'column',
				gap: 10,
				minWidth: 260,
				border: '2px solid #6ea8ff',
				borderRadius: 10,
				background: 'rgba(8,10,16,0.92)',
				padding: '12px 16px',
				fontFamily: 'monospace',
				color: '#e6ebf5',
				textShadow: TEXT_SHADOW,
			}}>
			<span style={{ fontSize: 14 }}>
				{prompt.other_name} challenges you to a pet duel!
			</span>
			<div
				style={{
					height: 4,
					borderRadius: 2,
					background: 'rgba(110,168,255,0.15)',
					overflow: 'hidden',
				}}>
				<div
					style={{
						height: '100%',
						width: `${pct}%`,
						background: pct > 25 ? '#6ea8ff' : '#ef4444',
						transition: 'width 200ms linear',
					}}
				/>
			</div>
			<div
				style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
				<BattleButton
					label="Decline ✕"
					onClick={() => respond(false)}
				/>
				<BattleButton label="Accept ⚔" onClick={() => respond(true)} />
			</div>
		</div>
	);
}

/**
 * Always-mounted battle host: opens the moment `battle:enter` fires (loading curtain,
 * before the first state lands), then swaps in <PetBattleScene> once a PetBattleState
 * streams in. Mounted outside any debug gate so PvP/trainer duels get a scene
 * regardless of the DEBUG_HUD flag.
 */
function PetBattleOverlay() {
	const [state, setState] = useState<PetBattleState | null>(null);
	const [entering, setEntering] = useState(false);

	useEffect(() => {
		const offEnter = onBattleEnter(() => {
			setState(null);
			setEntering(true);
		});
		const offState = onPetBattleState((s) => {
			setEntering(true);
			setState(s);
		});
		return () => {
			offEnter();
			offState();
		};
	}, []);

	const close = () => {
		setEntering(false);
		setState(null);
		emitBattleExit();
	};

	if (!entering) return null;
	return state ? (
		<PetBattleScene
			state={state}
			onAction={(action, arg) => emitPetBattleAction({ action, arg })}
			onClose={close}
		/>
	) : (
		<BattleEntering onCancel={close} />
	);
}

/**
 * Debug-only trigger: a button that starts an interactive 5v5 mechamutt battle. Firing
 * `battle:enter` + a request is enough — the always-mounted <PetBattleOverlay> owns the
 * loading curtain and the scene itself. Temporary placement — the real encounter flow
 * replaces it later.
 */
function PetBattleDebug() {
	const [entering, setEntering] = useState(false);

	useEffect(() => {
		const offEnter = onBattleEnter(() => setEntering(true));
		const offExit = onBattleExit(() => setEntering(false));
		return () => {
			offEnter();
			offExit();
		};
	}, []);

	const open = () => {
		if (entering) return;
		emitBattleEnter({ kind: 'pet' });
		emitPetBattleRequest();
	};

	return (
		<button
			type="button"
			onClick={open}
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
			{entering ? '⚔ In Battle…' : '⚔ Sim Battle (5v5)'}
		</button>
	);
}

const BATTLE_ENTER_CSS = `
@keyframes arpgBattleFade{from{opacity:0}to{opacity:1}}
@keyframes arpgVsPulse{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.12);opacity:1}}
@keyframes arpgSlideL{from{transform:translateX(-60px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes arpgSlideR{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes arpgDots{0%{content:''}33%{content:'.'}66%{content:'..'}100%{content:'...'}}
`;

/** Loading curtain shown from click until the server's first PetBattleState lands.
 * Opening it on the global battle-enter event (not on state arrival) makes the action
 * feel instant even while the round trip is in flight. */
function BattleEntering({ onCancel }: { onCancel: () => void }) {
	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				pointerEvents: 'auto',
				zIndex: 40,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 18,
				fontFamily: 'monospace',
				color: '#e6ebf5',
				background:
					'radial-gradient(ellipse at center, rgba(20,28,48,0.92), rgba(4,6,12,0.97))',
				animation: 'arpgBattleFade 180ms ease-out',
			}}>
			<style>{BATTLE_ENTER_CSS}</style>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 22,
					fontSize: 30,
					fontWeight: 700,
					letterSpacing: 2,
					textShadow: TEXT_SHADOW,
				}}>
				<span style={{ animation: 'arpgSlideL 320ms ease-out' }}>
					YOU
				</span>
				<span
					style={{
						color: '#fbbf24',
						animation: 'arpgVsPulse 900ms ease-in-out infinite',
					}}>
					VS
				</span>
				<span style={{ animation: 'arpgSlideR 320ms ease-out' }}>
					FOE
				</span>
			</div>
			<span style={{ color: MUTED, fontSize: 13 }}>Entering battle…</span>
			<BattleButton label="Cancel ✕" onClick={onCancel} />
		</div>
	);
}

const SPRITE_OF = (ref: string) => arpgAsset(`/assets/npc/${ref}.png`);
const STEP_MS = 650;

// One-shot battle juice. Sprite shake/lunge (transform on the wrapper), white hit-flash
// (filter on the img), and the floating damage/heal number. All retrigger by remounting
// on a per-event nonce key, so each event replays its animation from the top.
const BATTLE_FX_CSS = `
@keyframes arpgHitShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-9px)}75%{transform:translateX(9px)}}
@keyframes arpgHitShakeBig{0%,100%{transform:translate(0,0)}20%{transform:translate(-13px,4px)}50%{transform:translate(13px,-4px)}80%{transform:translate(-9px,3px)}}
@keyframes arpgLungeP{0%,100%{transform:translate(0,0)}40%{transform:translate(22px,-16px)}}
@keyframes arpgLungeE{0%,100%{transform:translate(0,0)}40%{transform:translate(-22px,16px)}}
@keyframes arpgImgFlash{0%{filter:brightness(1)}30%{filter:brightness(2.6) saturate(0)}100%{filter:brightness(1)}}
@keyframes arpgFloatUp{0%{opacity:0;transform:translate(-50%,0) scale(.7)}20%{opacity:1;transform:translate(-50%,-10px) scale(1.1)}100%{opacity:0;transform:translate(-50%,-46px) scale(1)}}
@keyframes arpgLowBlink{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes arpgSceneFade{from{opacity:0}to{opacity:1}}
`;

interface BattleView {
	pIdx: number;
	eIdx: number;
	pHp: number;
	eHp: number;
	text: string;
	// Per-event juice, bumped each step so the CSS one-shots retrigger (keyed by nonce).
	fxNonce: number;
	hitSide: number; // side taking damage → flash + shake
	attackSide: number; // side using a move → lunge
	crit: boolean;
	eff: number; // 0 normal / 1 super / 2 not-very / 3 immune
	popSide: number; // side a floating number rises over
	popVal: number;
	popHeal: boolean;
}

const NO_FX = {
	hitSide: -1,
	attackSide: -1,
	crit: false,
	eff: 0,
	popSide: -1,
	popVal: 0,
	popHeal: false,
};

function startView(s: PetBattleState): BattleView {
	return {
		pIdx: s.p_active,
		eIdx: s.e_active,
		pHp: s.player[s.p_active]?.hp ?? 0,
		eHp: s.enemy[s.e_active]?.hp ?? 0,
		text: s.events[0]?.text ?? '',
		fxNonce: 0,
		...NO_FX,
	};
}

/** Fold one battle event into the running view: HP + active index + the line, plus the
 * one-shot juice (flash/shake/lunge/floating number) for this event. */
function applyEvent(
	v: BattleView,
	e: PetBattleWireEvent,
	s: PetBattleState,
): BattleView {
	const next: BattleView = {
		...v,
		...NO_FX,
		text: e.text || v.text,
		fxNonce: v.fxNonce + 1,
	};
	if (e.kind === PB_SWAP) {
		if (e.side === 0) {
			next.pIdx = e.value;
			next.pHp = s.player[e.value]?.hp ?? next.pHp;
		} else {
			next.eIdx = e.value;
			next.eHp = s.enemy[e.value]?.hp ?? next.eHp;
		}
	} else if (e.kind === PB_USED) {
		next.attackSide = e.side;
	} else if (e.kind === PB_DAMAGE) {
		if (e.side === 0) next.pHp = e.hp;
		else next.eHp = e.hp;
		next.hitSide = e.side;
		next.popSide = e.side;
		next.popVal = e.value;
		next.crit = (e.flag & 1) === 1;
		next.eff = (e.flag >> 1) & 3;
	} else if (e.kind === PB_STATUS_DMG) {
		if (e.side === 0) next.pHp = e.hp;
		else next.eHp = e.hp;
		next.hitSide = e.side;
		next.popSide = e.side;
		next.popVal = e.value;
	} else if (e.kind === PB_HEAL) {
		if (e.side === 0) next.pHp = e.hp;
		else next.eHp = e.hp;
		next.popSide = e.side;
		next.popVal = e.value;
		next.popHeal = true;
	} else if (e.kind === PB_FAINT) {
		if (e.side === 0) next.pHp = 0;
		else next.eHp = 0;
	}
	return next;
}

interface BattlerFx {
	nonce: number;
	flash: boolean;
	big: boolean;
	attack: boolean;
	pop: { val: number; heal: boolean; crit: boolean; eff: number } | null;
}

function fxForSide(v: BattleView, side: number): BattlerFx {
	return {
		nonce: v.fxNonce,
		flash: v.hitSide === side,
		big: v.hitSide === side && v.crit,
		attack: v.attackSide === side,
		pop:
			v.popSide === side
				? { val: v.popVal, heal: v.popHeal, crit: v.crit, eff: v.eff }
				: null,
	};
}

function popColor(p: { heal: boolean; crit: boolean; eff: number }): string {
	if (p.heal) return '#22c55e';
	if (p.crit) return '#fbbf24';
	if (p.eff === 1) return '#f97316';
	if (p.eff === 2 || p.eff === 3) return '#94a3b8';
	return '#ef4444';
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
export function PetBattleScene({
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
	const [turnStart, setTurnStart] = useState(() => Date.now());

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const fxRef = useRef<BattleFx | null>(null);
	const pSpriteRef = useRef<HTMLDivElement | null>(null);
	const eSpriteRef = useRef<HTMLDivElement | null>(null);
	// A melee/physical move bursts on impact (the damage event), not on cast — stash its
	// element style here when the "uses move" event fires.
	const pendingMelee = useRef<{
		side: number;
		style: ReturnType<typeof elementStyle>;
	} | null>(null);

	// Spin up the canvas effects layer for the life of the scene.
	useEffect(() => {
		if (!canvasRef.current) return;
		const fx = new BattleFx(canvasRef.current);
		fxRef.current = fx;
		const onResize = () => fx.resize();
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('resize', onResize);
			fx.dispose();
			fxRef.current = null;
		};
	}, []);

	// Centre of a side's sprite, in canvas px (for spawning effects there).
	const sideCenter = (side: number): { x: number; y: number } | null => {
		const el = side === 0 ? pSpriteRef.current : eSpriteRef.current;
		const c = canvasRef.current;
		if (!el || !c) return null;
		const r = el.getBoundingClientRect();
		const cr = c.getBoundingClientRect();
		return {
			x: r.left + r.width / 2 - cr.left,
			y: r.top + r.height / 2 - cr.top,
		};
	};

	// Spawn the elemental VFX for one event: a travelling bolt for ranged moves, a burst on
	// self for status moves, and an impact burst on the damage of a melee hit.
	const fireFx = (e: PetBattleWireEvent): void => {
		const fx = fxRef.current;
		if (!fx) return;
		if (e.kind === PB_USED) {
			const style = elementStyle(ELEMENT_NAMES[e.value] ?? 'none');
			const target = 1 - e.side;
			const from = sideCenter(e.side);
			const to = sideCenter(target);
			if (!from || !to) return;
			if ((e.flag & PB_USED_RANGED) !== 0) {
				fx.bolt(from.x, from.y, to.x, to.y, style, () =>
					fx.burst(to.x, to.y, style),
				);
			} else if ((e.flag & PB_USED_CATEGORY_MASK) === 2) {
				fx.burst(from.x, from.y, style); // status/buff on self
			} else {
				pendingMelee.current = { side: target, style };
			}
		} else if (e.kind === PB_DAMAGE) {
			const pm = pendingMelee.current;
			if (pm) {
				const c = sideCenter(pm.side);
				if (c) fx.burst(c.x, c.y, pm.style, 18);
				pendingMelee.current = null;
			}
		}
	};

	// A new turn arrived: replay its events from the top (the view's HP carries over from
	// the previous turn, so bars tween continuously). An event-less view is the
	// server echoing a commit while the opponent decides — stay in waiting.
	useEffect(() => {
		setStep(0);
		setWaiting((w) => w && state.events.length === 0);
		setSwapOpen(false);
		pendingMelee.current = null;
	}, [state]);

	// Turn-timer bar: re-anchor the wall-clock start whenever a new deadline arrives,
	// then tick a redraw every 250ms so the bar drains toward it.
	const [, setTick] = useState(0);
	useEffect(() => {
		setTurnStart(Date.now());
	}, [state]);
	useEffect(() => {
		const t = setInterval(() => setTick((n) => n + 1), 250);
		return () => clearInterval(t);
	}, []);
	const turnRemaining =
		state.deadline_ms > 0
			? Math.max(0, state.deadline_ms - (Date.now() - turnStart))
			: 0;
	const turnPct =
		state.deadline_ms > 0
			? Math.max(
					0,
					Math.min(100, (turnRemaining / state.deadline_ms) * 100),
				)
			: 0;

	// Step through the current turn's events on a timer, folding each into the view and
	// spawning its canvas effects.
	useEffect(() => {
		if (step >= state.events.length) return;
		const e = state.events[step];
		setView((v) => applyEvent(v, e, state));
		fireFx(e);
		const t = setTimeout(() => setStep((n) => n + 1), STEP_MS);
		return () => clearTimeout(t);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [step, state]);

	const animating = step < state.events.length;
	const over = state.outcome !== 'Ongoing';
	const forceSwap = state.phase === 'replace';
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
				alignItems: 'center',
				justifyContent: 'center',
				padding: 16,
				fontFamily: 'monospace',
				color: '#e6ebf5',
				background:
					'radial-gradient(ellipse at center, rgba(20,28,48,0.92), rgba(4,6,12,0.97))',
				animation: 'arpgSceneFade 160ms ease-out',
			}}>
			<style>{BATTLE_FX_CSS}</style>
			{/* Constrained stage: keeps both battlers close together on any viewport
			    instead of pinning them to opposite screen corners. */}
			<div
				style={{
					position: 'relative',
					width: 'min(94vw, 860px)',
					display: 'flex',
					flexDirection: 'column',
					gap: 6,
				}}>
				{/* Element VFX layer — bolts + bursts, above the sprites, click-through. */}
				<canvas
					ref={canvasRef}
					style={{
						position: 'absolute',
						inset: 0,
						width: '100%',
						height: '100%',
						pointerEvents: 'none',
						zIndex: 5,
					}}
				/>
				{state.opponent && (
					<div
						style={{
							textAlign: 'right',
							fontSize: 13,
							color: MUTED,
							textShadow: TEXT_SHADOW,
						}}>
						{state.opponent}
					</div>
				)}
				{/* Enemy row: info box left, sprite right (classic JRPG cross layout). */}
				<Battler
					battler={eTeam}
					hp={view.eHp}
					alive={aliveCount(state.enemy)}
					total={state.enemy.length}
					fx={fxForSide(view, 1)}
					spriteRef={eSpriteRef}
					foe
				/>
				{/* Player row: sprite left, info box right; pulled up into the enemy
				    row's empty diagonal so the two monsters face each other. */}
				<div style={{ marginTop: 'clamp(-56px, -7vmin, -20px)' }}>
					<Battler
						battler={pTeam}
						hp={view.pHp}
						alive={aliveCount(state.player)}
						total={state.player.length}
						fx={fxForSide(view, 0)}
						spriteRef={pSpriteRef}
					/>
				</div>

				{/* Text box + action menu */}
				<div
					style={{
						position: 'relative',
						zIndex: 6,
						pointerEvents: 'auto',
						border: '2px solid #6ea8ff',
						borderRadius: 12,
						boxShadow:
							'0 0 0 2px rgba(8,10,16,0.9), 0 4px 0 rgba(110,168,255,0.25)',
						background: 'rgba(8,10,16,0.94)',
						padding: '12px 16px',
						minHeight: 56,
						display: 'flex',
						flexDirection: 'column',
						gap: 10,
						marginTop: 8,
					}}>
					{!over && state.deadline_ms > 0 && (
						<div
							style={{
								height: 4,
								borderRadius: 2,
								background: 'rgba(110,168,255,0.15)',
								overflow: 'hidden',
							}}>
							<div
								style={{
									height: '100%',
									width: `${turnPct}%`,
									background:
										turnPct > 25 ? '#6ea8ff' : '#ef4444',
									transition: 'width 200ms linear',
								}}
							/>
						</div>
					)}
					<span style={{ fontSize: 15, minHeight: 20 }}>
						{over
							? `Battle over — ${outcomeLabel(state.outcome)}`
							: view.text}
					</span>
					{over ? (
						<div
							style={{
								display: 'flex',
								justifyContent: 'flex-end',
							}}>
							<BattleButton label="Close ✕" onClick={onClose} />
						</div>
					) : showMenu ? (
						swapOpen || forceSwap ? (
							<div
								style={{
									display: 'flex',
									flexWrap: 'wrap',
									gap: 8,
								}}>
								{reserves.length === 0 && (
									<span
										style={{ color: MUTED, fontSize: 12 }}>
										No reserves left.
									</span>
								)}
								{reserves.map((r) => (
									<BattleButton
										key={r.i}
										label={`${r.b.nickname} (${r.b.hp}/${r.b.max_hp})`}
										onClick={() =>
											commit(PET_ACT_SWAP, r.i)
										}
									/>
								))}
								{!forceSwap && (
									<BattleButton
										label="↩ Back"
										onClick={() => setSwapOpen(false)}
									/>
								)}
							</div>
						) : (
							<div
								style={{
									display: 'flex',
									flexWrap: 'wrap',
									gap: 12,
									alignItems: 'stretch',
								}}>
								{/* Moves fill a 2×2 grid; utility actions stack in a column
								    beside it, like the classic FIGHT/BAG/RUN split. */}
								<div
									style={{
										display: 'grid',
										gridTemplateColumns: '1fr 1fr',
										gap: 8,
										flex: '1 1 320px',
									}}>
									{state.moves.map((m) => (
										<MoveButton
											key={m.slot}
											move={m}
											onClick={() =>
												commit(PET_ACT_MOVE, m.slot)
											}
										/>
									))}
								</div>
								<div
									style={{
										display: 'flex',
										flexDirection: 'column',
										gap: 8,
										flex: '0 0 auto',
										justifyContent: 'flex-start',
									}}>
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
											onClick={() =>
												commit(PET_ACT_RUN, 0)
											}
										/>
									)}
								</div>
							</div>
						)
					) : (
						<span style={{ color: MUTED, fontSize: 12 }}>
							{waiting ? `Waiting for ${state.opponent}…` : '…'}
						</span>
					)}
				</div>
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
	const tint = elementStyle(move.element.toLowerCase());
	return (
		<button
			type="button"
			disabled={dead}
			onClick={onClick}
			title={`${move.element} · power ${move.power} · acc ${move.accuracy > 100 ? '∞' : `${move.accuracy}%`}`}
			style={{
				padding: '8px 12px',
				fontFamily: 'monospace',
				fontSize: 13,
				textAlign: 'left',
				color: '#e6ebf5',
				background: 'rgba(40,20,60,0.85)',
				border: `1px solid ${tint.ramp[1]}`,
				borderLeft: `4px solid ${tint.ramp[1]}`,
				borderRadius: 6,
				opacity: dead ? 0.4 : 1,
				cursor: dead ? 'not-allowed' : 'pointer',
				display: 'flex',
				justifyContent: 'space-between',
				alignItems: 'baseline',
				gap: 10,
			}}>
			<span style={{ fontWeight: 700 }}>{move.name}</span>
			<span style={{ color: MUTED, fontSize: 11 }}>
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
	fx,
	spriteRef,
	foe = false,
}: {
	battler: PetBattler | undefined;
	hp: number;
	alive: number;
	total: number;
	fx: BattlerFx;
	spriteRef?: Ref<HTMLDivElement>;
	foe?: boolean;
}) {
	const [imgBroken, setImgBroken] = useState(false);
	if (!battler) return null;
	const pct = Math.max(
		0,
		Math.min(100, (hp / Math.max(1, battler.max_hp)) * 100),
	);
	const barColor = pct > 50 ? '#22c55e' : pct > 20 ? '#eab308' : '#ef4444';
	const fainted = hp <= 0;
	const lunge = fx.attack
		? foe
			? 'arpgLungeE 0.45s ease'
			: 'arpgLungeP 0.45s ease'
		: fx.big
			? 'arpgHitShakeBig 0.4s ease'
			: fx.flash
				? 'arpgHitShake 0.3s ease'
				: 'none';
	// Remount the sprite wrapper only while an effect plays, so the animation restarts;
	// idle keeps a stable key so the <img> (and its broken-state) doesn't churn.
	const animKey = fx.flash || fx.attack ? `a${fx.nonce}` : 'idle';
	const baseFilter = fainted ? 'grayscale(1) brightness(0.5)' : 'none';
	// Your own monster reads bigger (nearer the "camera"), the foe slightly smaller.
	const size = foe
		? 'clamp(112px, 22vmin, 176px)'
		: 'clamp(128px, 26vmin, 208px)';
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: foe ? 'row' : 'row-reverse',
				justifyContent: 'space-between',
				alignItems: foe ? 'flex-start' : 'flex-end',
				width: '100%',
				gap: 16,
			}}>
			<div
				style={{
					flex: '0 1 300px',
					minWidth: 220,
					background: 'rgba(8,10,16,0.92)',
					border: '2px solid #6ea8ff',
					borderRadius: 10,
					boxShadow: '0 3px 0 rgba(110,168,255,0.3)',
					padding: '8px 12px',
					marginTop: foe ? 10 : 0,
					marginBottom: foe ? 0 : 10,
				}}>
				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						fontSize: 13,
						fontWeight: 700,
					}}>
					<span>{battler.nickname}</span>
					<span style={{ color: MUTED, fontWeight: 400 }}>
						Lv {battler.level}
					</span>
				</div>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						margin: '5px 0',
					}}>
					<span
						style={{
							fontSize: 9,
							fontWeight: 700,
							letterSpacing: 1,
							color: '#6ea8ff',
						}}>
						HP
					</span>
					<div
						style={{
							flex: 1,
							height: 8,
							borderRadius: 4,
							background: 'rgba(255,255,255,0.12)',
							overflow: 'hidden',
						}}>
						<div
							style={{
								height: '100%',
								width: `${pct}%`,
								background: barColor,
								transition:
									'width 0.35s ease, background 0.35s ease',
								animation:
									pct > 0 && pct <= 20
										? 'arpgLowBlink 0.7s ease infinite'
										: 'none',
							}}
						/>
					</div>
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
			<div
				ref={spriteRef}
				style={{
					position: 'relative',
					width: size,
					height: size,
					transform: fainted ? 'translateY(10px)' : 'none',
					opacity: fainted ? 0.7 : 1,
					transition: 'transform 0.4s ease, opacity 0.4s ease',
				}}>
				{/* Ground platform under the monster, like the battle podiums. */}
				<div
					style={{
						position: 'absolute',
						left: '50%',
						bottom: '-4%',
						width: '130%',
						height: '26%',
						transform: 'translateX(-50%)',
						borderRadius: '50%',
						background:
							'radial-gradient(ellipse at center, rgba(110,168,255,0.3), rgba(110,168,255,0) 70%)',
						pointerEvents: 'none',
					}}
				/>
				<span
					key={animKey}
					style={{
						display: 'block',
						width: '100%',
						height: '100%',
						animation: lunge,
					}}>
					{imgBroken ? (
						<span
							aria-label={battler.nickname}
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: '100%',
								height: '100%',
								fontSize: 56,
								borderRadius: 12,
								background: 'rgba(110,168,255,0.12)',
								border: '1px dashed #6ea8ff',
								filter: baseFilter,
							}}>
							🐾
						</span>
					) : (
						<img
							src={SPRITE_OF(battler.species_ref)}
							alt={battler.nickname}
							onError={() => setImgBroken(true)}
							style={{
								width: '100%',
								height: '100%',
								imageRendering: 'pixelated',
								transform: foe ? 'none' : 'scaleX(-1)',
								filter: baseFilter,
								animation: fx.flash
									? 'arpgImgFlash 0.25s ease'
									: 'none',
							}}
						/>
					)}
				</span>
				{fx.pop && (
					<span
						key={`pop${fx.nonce}`}
						style={{
							position: 'absolute',
							top: 0,
							left: '50%',
							fontWeight: 700,
							fontSize: fx.pop.crit ? 26 : 19,
							color: popColor(fx.pop),
							textShadow: '0 1px 2px #000',
							animation: 'arpgFloatUp 0.9s ease forwards',
							pointerEvents: 'none',
							whiteSpace: 'nowrap',
						}}>
						{fx.pop.heal ? '+' : '−'}
						{Math.abs(fx.pop.val)}
						{fx.pop.crit ? '!' : ''}
					</span>
				)}
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
				padding: '8px 14px',
				fontFamily: 'monospace',
				fontSize: 13,
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
