import { useStore } from '@nanostores/react';
import type { CSSProperties, ReactNode } from 'react';
import {
	bestWaveAtom,
	batteryCapacityAtom,
	batteryChargeAtom,
	bountyMulAtom,
	canSkipAtom,
	cardOptionsAtom,
	cardPickSignalAtom,
	cardSkipSignalAtom,
	cardWaveAtom,
	demandAtom,
	enemiesLeftAtom,
	freeTowersAtom,
	gameOverAtom,
	goldAtom,
	inventoryAtom,
	inventoryOpenAtom,
	livesAtom,
	enemyHoverAtom,
	gameStateAtom,
	gameStatsAtom,
	pendingItemTargetAtom,
	playRequestSignalAtom,
	nextWavePreviewAtom,
	restartSignalAtom,
	selectedBuildAtom,
	skipSignalAtom,
	speedFactorAtom,
	supplyAtom,
	timerSecAtom,
	timerStateAtom,
	useItemSignalAtom,
	waveAtom,
} from './td-hud-store';
import type { CardOption } from './cards';
import { PALETTE_ORDER, specFor, type BuildId } from './config';
import { defFor, type ItemInstance } from './items';
import { $auth } from '@kbve/astro';

type IconName =
	| 'coin'
	| 'heart'
	| 'list'
	| 'target'
	| 'zap'
	| 'battery'
	| 'plus'
	| 'dollar'
	| 'hourglass'
	| 'swords';

const ICON_PATHS: Record<IconName, ReactNode> = {
	coin: (
		<>
			<circle cx="12" cy="12" r="9" />
			<path d="M14.5 9H10.5a1.5 1.5 0 0 0 0 3h3a1.5 1.5 0 0 1 0 3H9.5M12 7v1.5M12 15.5V17" />
		</>
	),
	heart: (
		<path d="M19.5 13.572L12 21l-7.5-7.428A5 5 0 1 1 12 6.006a5 5 0 1 1 7.5 7.566z" />
	),
	list: <path d="M4 6h16M4 12h16M4 18h16" />,
	target: (
		<>
			<circle cx="12" cy="12" r="9" />
			<circle cx="12" cy="12" r="5" />
			<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
		</>
	),
	zap: <path d="M13 2L4 14h7l-1 8 10-12h-7l1-8z" />,
	battery: (
		<>
			<rect x="2" y="8" width="16" height="8" rx="1.5" />
			<path d="M20 11v2" />
		</>
	),
	plus: <path d="M12 5v14M5 12h14" />,
	dollar: (
		<path d="M12 2v20M16 6.5C15 5 13.6 4 12 4c-2.5 0-4.5 1.5-4.5 4s2 3 4.5 3.5c2.5.5 4.5 1 4.5 3.5s-2 4-4.5 4c-1.6 0-3-1-4-2.5" />
	),
	hourglass: (
		<path d="M6 2h12M6 22h12M6 2v3a6 6 0 0 0 12 0V2M6 22v-3a6 6 0 0 1 12 0v3" />
	),
	swords: (
		<>
			<path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
			<path d="M13 19l2-2 4 4-2 2-4-4z" />
			<path d="M16 16l4-4M14.5 5.5L20 3l-2.5 5.5z" />
			<path d="M5 14l-2 5 5-2-3-3z" />
		</>
	),
};

interface IconProps {
	name: IconName;
	size?: number;
}

function Icon({ name, size = 13 }: IconProps) {
	return (
		<svg
			className="td-chip-svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden>
			{ICON_PATHS[name]}
		</svg>
	);
}

interface ChipProps {
	icon: IconName;
	label: string;
	value: string | number;
	tone?: 'default' | 'danger' | 'good' | 'gold' | 'battery';
	title?: string;
}

function Chip({ icon, label, value, tone = 'default', title }: ChipProps) {
	return (
		<div className={`td-chip td-chip-${tone}`} title={title}>
			<Icon name={icon} />
			<span className="td-chip-label">{label}</span>
			<span className="td-chip-value">{value}</span>
		</div>
	);
}

function GoldChip() {
	const v = useStore(goldAtom);
	return (
		<Chip
			icon="coin"
			label="Gold"
			value={v}
			tone="gold"
			title="Coins earned from kills + cards. Spend to place buildings + upgrade."
		/>
	);
}

function LivesChip() {
	const v = useStore(livesAtom);
	const tone = v <= 5 ? 'danger' : 'default';
	return (
		<Chip
			icon="heart"
			label="Lives"
			value={v}
			tone={tone}
			title="Lost when an enemy reaches the path end. Hit zero = game over."
		/>
	);
}

function WaveChip() {
	const v = useStore(waveAtom);
	return (
		<Chip
			icon="list"
			label="Wave"
			value={v}
			tone="default"
			title="Current wave. Every 5th wave spawns a boss."
		/>
	);
}

function EnemiesChip() {
	const v = useStore(enemiesLeftAtom);
	return (
		<Chip
			icon="target"
			label="Left"
			value={v}
			tone="default"
			title="Enemies remaining to spawn + alive in this wave."
		/>
	);
}

function PowerChip() {
	const supply = useStore(supplyAtom);
	const demand = useStore(demandAtom);
	const tone = supply >= demand ? 'good' : 'danger';
	return (
		<Chip
			icon="zap"
			label="Power"
			value={`${supply}/${demand}`}
			tone={tone}
			title="Supply / demand. Excess charges batteries; deficit drains them then knocks towers offline by placement order."
		/>
	);
}

function BatteryChip() {
	const charge = useStore(batteryChargeAtom);
	const cap = useStore(batteryCapacityAtom);
	if (cap <= 0) return null;
	return (
		<Chip
			icon="battery"
			label="Charge"
			value={`${Math.floor(charge)}/${cap}`}
			tone="battery"
			title="Stored battery energy. Burned when supply < demand."
		/>
	);
}

function FreeTowerChip() {
	const v = useStore(freeTowersAtom);
	if (v <= 0) return null;
	return (
		<Chip
			icon="plus"
			label="Free Tower"
			value={v}
			tone="gold"
			title="Next basic tower placement is free (from a card)."
		/>
	);
}

function BountyChip() {
	const v = useStore(bountyMulAtom);
	if (v <= 1) return null;
	return (
		<Chip
			icon="dollar"
			label="Bounty"
			value={`×${v.toFixed(1)}`}
			tone="battery"
			title="Kill rewards multiplier this wave (from a card)."
		/>
	);
}

function SpeedControls() {
	const speed = useStore(speedFactorAtom);
	const opts: Array<{ label: string; value: number }> = [
		{ label: '❚❚', value: 0 },
		{ label: '1×', value: 1 },
		{ label: '2×', value: 2 },
		{ label: '3×', value: 3 },
	];
	return (
		<div className="td-speed" title="Pause / game speed">
			{opts.map((opt) => (
				<button
					key={opt.value}
					type="button"
					className={`td-speed-btn${speed === opt.value ? ' td-speed-btn-active' : ''}`}
					onClick={() => speedFactorAtom.set(opt.value)}>
					{opt.label}
				</button>
			))}
		</div>
	);
}

function NextWavePreview() {
	const state = useStore(timerStateAtom);
	const preview = useStore(nextWavePreviewAtom);
	if (state === 'IN_PROGRESS' || preview.count === 0) return null;
	const summary =
		preview.bossCount > 0 ? `${preview.count} + boss` : `${preview.count}`;
	return (
		<Chip
			icon="target"
			label="Incoming"
			value={summary}
			tone={preview.bossCount > 0 ? 'danger' : 'default'}
			title="Composition of the next wave"
		/>
	);
}

function TimerSlot() {
	const state = useStore(timerStateAtom);
	const sec = useStore(timerSecAtom);
	const canSkip = useStore(canSkipAtom);
	const inProgress = state === 'IN_PROGRESS';
	const label = inProgress ? 'Wave' : 'Next';
	const value = inProgress ? 'live' : `${Math.max(0, sec)}s`;
	return (
		<div
			className="td-timer"
			title={
				inProgress
					? 'Wave in progress'
					: 'Time until the next wave starts. Press Skip to start it now.'
			}>
			<Icon name={inProgress ? 'swords' : 'hourglass'} />
			<span className="td-chip-label">{label}</span>
			<span className="td-chip-value">{value}</span>
			{canSkip ? (
				<button
					type="button"
					className="td-skip"
					onClick={() => skipSignalAtom.set(skipSignalAtom.get() + 1)}
					title="Skip the countdown">
					Skip
					<span className="td-skip-arrow" aria-hidden>
						→
					</span>
				</button>
			) : null}
		</div>
	);
}

function hexColor(n: number): string {
	return '#' + n.toString(16).padStart(6, '0');
}

function PaletteBar() {
	const selected = useStore(selectedBuildAtom);
	const gold = useStore(goldAtom);
	const freeTowers = useStore(freeTowersAtom);
	return (
		<div className="td-palette">
			{PALETTE_ORDER.map((id: BuildId, i) => {
				const spec = specFor(id);
				const isFree = id === 'basic' && freeTowers > 0;
				const canAfford = isFree || gold >= spec.cost;
				const hotkey = i < 10 ? String((i + 1) % 10) : '';
				const accent = hexColor(spec.color);
				const style = { '--pal-accent': accent } as CSSProperties;
				const costLabel = isFree ? 'FREE' : `${spec.cost}g`;
				const powerSuffix =
					spec.kind === 'generator'
						? `+${spec.power}⚡`
						: spec.kind === 'tower' ||
							  spec.kind === 'repair' ||
							  spec.kind === 'armoury'
							? `−${spec.power}⚡`
							: spec.kind === 'battery'
								? `🔋${spec.capacity}`
								: '';
				const isActive = id === selected;
				const className =
					'td-pal' +
					(isActive ? ' td-pal-active' : '') +
					(!canAfford ? ' td-pal-poor' : '');
				return (
					<button
						key={id}
						type="button"
						className={className}
						style={style}
						title={`${spec.name} — ${costLabel}${powerSuffix ? ' · ' + powerSuffix : ''}`}
						onClick={() => selectedBuildAtom.set(id)}>
						{hotkey ? (
							<span className="td-pal-key">{hotkey}</span>
						) : null}
						<span className="td-pal-icon" />
						<span className="td-pal-name">{spec.name}</span>
						<span className="td-pal-cost">{costLabel}</span>
						{powerSuffix ? (
							<span className="td-pal-power">{powerSuffix}</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}

function InventoryChip() {
	const inventory = useStore(inventoryAtom);
	const open = useStore(inventoryOpenAtom);
	const count = inventory.reduce((s, it) => s + (it.charges > 0 ? 1 : 0), 0);
	return (
		<button
			type="button"
			className={`td-inv-btn${open ? ' td-inv-btn-open' : ''}`}
			onClick={() => inventoryOpenAtom.set(!open)}
			aria-label="Inventory">
			<span className="td-inv-btn-label">INV</span>
			<span className="td-inv-btn-count">{count}</span>
		</button>
	);
}

function InventoryPanel() {
	const open = useStore(inventoryOpenAtom);
	const inventory = useStore(inventoryAtom);
	if (!open) return null;
	const onUse = (it: ItemInstance) => {
		useItemSignalAtom.set({
			id: it.id,
			n: useItemSignalAtom.get().n + 1,
		});
	};
	const onClose = () => inventoryOpenAtom.set(false);
	return (
		<div className="td-inv" onClick={onClose}>
			<div className="td-inv-panel" onClick={(e) => e.stopPropagation()}>
				<div className="td-inv-head">
					<div className="td-inv-title">Inventory</div>
					<button
						type="button"
						className="td-inv-close"
						onClick={onClose}
						aria-label="Close inventory">
						✕
					</button>
				</div>
				{inventory.length === 0 ? (
					<div className="td-inv-empty">
						No items yet. Earn rewards from wave cards.
					</div>
				) : (
					<div className="td-inv-list">
						{inventory.map((it) => {
							const def = defFor(it.id);
							const accent = hexColor(def.color);
							const style = {
								'--card-accent': accent,
							} as CSSProperties;
							return (
								<button
									key={it.uid}
									type="button"
									className="td-inv-item"
									style={style}
									onClick={() => onUse(it)}>
									<div className="td-inv-item-mark" />
									<div className="td-inv-item-body">
										<div className="td-inv-item-name">
											{def.name}
										</div>
										<div className="td-inv-item-desc">
											{def.description}
										</div>
									</div>
									<div className="td-inv-item-charges">
										×{it.charges}
									</div>
								</button>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

function EnemyTooltip() {
	const info = useStore(enemyHoverAtom);
	if (!info) return null;
	const hpPct = info.maxHp > 0 ? (info.hp / info.maxHp) * 100 : 0;
	const armorPct = info.maxArmor > 0 ? (info.armor / info.maxArmor) * 100 : 0;
	const speedPct =
		info.baseSpeed > 0 ? (info.speed / info.baseSpeed) * 100 : 0;
	const status = info.dead ? 'DEAD' : info.immobile ? 'IMMOBILE' : 'ACTIVE';
	const style = {
		left: `${info.screenX + 16}px`,
		top: `${info.screenY + 16}px`,
	} as CSSProperties;
	return (
		<div className="td-tooltip" style={style}>
			<div className="td-tooltip-head">
				<span className="td-tooltip-name">{info.typeName}</span>
				<span className="td-tooltip-eid">eid {info.eid}</span>
			</div>
			<div className="td-tooltip-row">
				<span>HP</span>
				<span>
					{info.hp.toFixed(1)} / {info.maxHp.toFixed(0)} (
					{hpPct.toFixed(1)}%)
				</span>
			</div>
			<div className="td-tooltip-row">
				<span>Armor</span>
				<span>
					{info.armor.toFixed(1)} / {info.maxArmor.toFixed(0)} (
					{armorPct.toFixed(0)}%)
				</span>
			</div>
			<div className="td-tooltip-row">
				<span>Speed</span>
				<span>
					{info.speed.toFixed(1)} / {info.baseSpeed.toFixed(0)} (
					{speedPct.toFixed(0)}%)
				</span>
			</div>
			<div
				className={`td-tooltip-status td-tooltip-status-${status.toLowerCase()}`}>
				{status}
			</div>
		</div>
	);
}

function PendingTargetBanner() {
	const pending = useStore(pendingItemTargetAtom);
	if (!pending) return null;
	const def = defFor(pending);
	return (
		<div className="td-target-banner">
			<span className="td-target-banner-label">{def.name}</span>
			<span className="td-target-banner-hint">
				Click a building · Esc to cancel
			</span>
			<button
				type="button"
				className="td-target-banner-close"
				onClick={() => pendingItemTargetAtom.set(null)}
				aria-label="Cancel targeting">
				✕
			</button>
		</div>
	);
}

function CardModal() {
	const cards = useStore(cardOptionsAtom);
	const wave = useStore(cardWaveAtom);
	if (!cards) return null;
	const onPick = (card: CardOption) => {
		cardPickSignalAtom.set({
			id: card.id,
			n: cardPickSignalAtom.get().n + 1,
		});
	};
	const onSkip = () => {
		cardSkipSignalAtom.set(cardSkipSignalAtom.get() + 1);
	};
	return (
		<div className="td-cards">
			<div className="td-cards-panel">
				<div className="td-cards-eyebrow">Wave {wave} Cleared</div>
				<div className="td-cards-title">Pick a Reward</div>
				<div className="td-cards-row">
					{cards.map((card) => {
						const accent = hexColor(card.color);
						const style = {
							'--card-accent': accent,
						} as CSSProperties;
						return (
							<button
								key={card.id}
								type="button"
								className="td-card"
								style={style}
								onClick={() => onPick(card)}>
								<div className="td-card-mark" />
								<div className="td-card-name">{card.name}</div>
								<div className="td-card-desc">
									{card.description}
								</div>
							</button>
						);
					})}
				</div>
				<button
					type="button"
					className="td-cards-skip"
					onClick={onSkip}>
					Skip · Esc
				</button>
			</div>
		</div>
	);
}

function TitleScreen() {
	const state = useStore(gameStateAtom);
	const best = useStore(bestWaveAtom);
	const auth = useStore($auth);
	if (state !== 'title') return null;
	const onPlay = () => {
		playRequestSignalAtom.set(playRequestSignalAtom.get() + 1);
	};
	const authed = auth.tone === 'auth';
	const displayName = auth.username || auth.name || '';
	return (
		<div className="td-title">
			<div className="td-title-card">
				<div className="td-title-eyebrow">KBVE Arcade</div>
				<div className="td-title-name">TOWER DEFENSE</div>
				<div className="td-title-tag">
					Hold the line. Build, upgrade, survive the swarm.
				</div>
				{authed && displayName ? (
					<div className="td-title-user">
						{auth.avatar ? (
							<img
								className="td-title-avatar"
								src={auth.avatar}
								alt=""
							/>
						) : null}
						<span>
							Welcome back, <strong>{displayName}</strong>
						</span>
					</div>
				) : auth.tone === 'anon' ? (
					<div className="td-title-user td-title-user-anon">
						Playing as guest — sign in to save runs
					</div>
				) : null}
				<button
					type="button"
					className="td-title-play"
					onClick={onPlay}>
					Play
				</button>
				<div className="td-title-best">
					{best > 0 ? `Best run: wave ${best}` : 'No runs yet'}
				</div>
			</div>
		</div>
	);
}

function GameOverRecap() {
	const state = useStore(gameStateAtom);
	const stats = useStore(gameStatsAtom);
	const best = useStore(bestWaveAtom);
	if (state !== 'gameover' || !stats) return null;
	const accent = stats.win || stats.newRecord ? '#48bb78' : '#fc8181';
	const style = { '--td-accent': accent } as CSSProperties;
	const onTitle = () => {
		gameStateAtom.set('title');
	};
	const onReplay = () => {
		playRequestSignalAtom.set(playRequestSignalAtom.get() + 1);
	};
	return (
		<div className="td-over" style={style}>
			<div className="td-over-card">
				<div className="td-over-eyebrow">
					{stats.win ? 'Mission Complete' : 'Mission Failed'}
				</div>
				<div className="td-over-title">
					{stats.win ? 'VICTORY' : 'DEFEAT'}
				</div>
				<div className="td-over-sub">
					Cleared {stats.wave} {stats.wave === 1 ? 'wave' : 'waves'}
				</div>
				<div className="td-recap-grid">
					<div className="td-recap-row">
						<span>Enemies killed</span>
						<span>{stats.enemiesKilled}</span>
					</div>
					<div className="td-recap-row">
						<span>Bosses killed</span>
						<span>{stats.bossesKilled}</span>
					</div>
					<div className="td-recap-row">
						<span>Buildings built</span>
						<span>{stats.buildingsBuilt}</span>
					</div>
					<div className="td-recap-row">
						<span>Gold earned</span>
						<span>{stats.goldEarned}</span>
					</div>
					<div className="td-recap-row">
						<span>Lives remaining</span>
						<span>{stats.livesLeft}</span>
					</div>
				</div>
				{stats.newRecord ? (
					<div className="td-over-record">
						🏆 New best — beat {stats.bestBefore}
					</div>
				) : (
					<div className="td-over-record-dim">Best: wave {best}</div>
				)}
				<div className="td-over-actions">
					<button
						type="button"
						className="td-over-restart"
						onClick={onReplay}>
						Play Again
					</button>
					<button
						type="button"
						className="td-over-title-btn"
						onClick={onTitle}>
						Title Screen
					</button>
				</div>
			</div>
		</div>
	);
}

function GameOverOverlay() {
	const state = useStore(gameOverAtom);
	const best = useStore(bestWaveAtom);
	const flow = useStore(gameStateAtom);
	if (!state.visible || flow === 'gameover') return null;
	const accent = state.win || state.newRecord ? '#48bb78' : '#fc8181';
	const style = { '--td-accent': accent } as CSSProperties;
	return (
		<div className="td-over" style={style}>
			<div className="td-over-card">
				<div className="td-over-eyebrow">
					{state.win ? 'Mission Complete' : 'Mission Failed'}
				</div>
				<div className="td-over-title">
					{state.win ? 'VICTORY' : 'DEFEAT'}
				</div>
				<div className="td-over-sub">
					Cleared {state.wave} {state.wave === 1 ? 'wave' : 'waves'}
				</div>
				{state.newRecord ? (
					<div className="td-over-record">
						🏆 New best — beat {state.bestBefore}
					</div>
				) : (
					<div className="td-over-record-dim">Best: wave {best}</div>
				)}
				<button
					type="button"
					className="td-over-restart"
					onClick={() =>
						restartSignalAtom.set(restartSignalAtom.get() + 1)
					}>
					Restart
				</button>
				<div className="td-over-hint">or press R</div>
			</div>
		</div>
	);
}

export default function TdHud() {
	return (
		<div className="td-root">
			<div className="td-bar">
				<div className="td-group">
					<GoldChip />
					<LivesChip />
				</div>
				<div className="td-divider" />
				<div className="td-group">
					<WaveChip />
					<EnemiesChip />
				</div>
				<div className="td-divider" />
				<div className="td-group">
					<PowerChip />
					<BatteryChip />
				</div>
				<div className="td-group td-group-buffs">
					<FreeTowerChip />
					<BountyChip />
				</div>
				<div className="td-spacer" />
				<NextWavePreview />
				<SpeedControls />
				<div className="td-divider" />
				<InventoryChip />
				<div className="td-divider" />
				<TimerSlot />
			</div>
			<PaletteBar />
			<PendingTargetBanner />
			<InventoryPanel />
			<EnemyTooltip />
			<CardModal />
			<GameOverOverlay />
			<GameOverRecap />
			<TitleScreen />
		</div>
	);
}
