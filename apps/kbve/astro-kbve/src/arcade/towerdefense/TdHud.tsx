import { useStore } from '@nanostores/react';
import type { CSSProperties } from 'react';
import {
	batteryCapacityAtom,
	batteryChargeAtom,
	bountyMulAtom,
	canSkipAtom,
	demandAtom,
	enemiesLeftAtom,
	freeTowersAtom,
	gameOverAtom,
	goldAtom,
	livesAtom,
	restartSignalAtom,
	skipSignalAtom,
	supplyAtom,
	timerSecAtom,
	timerStateAtom,
	waveAtom,
} from './td-hud-store';

interface ChipProps {
	icon: string;
	value: string | number;
	tone?: 'default' | 'danger' | 'good' | 'gold' | 'battery';
	title?: string;
}

function Chip({ icon, value, tone = 'default', title }: ChipProps) {
	return (
		<div className={`td-chip td-chip-${tone}`} title={title}>
			<span className="td-chip-icon" aria-hidden>
				{icon}
			</span>
			<span className="td-chip-value">{value}</span>
		</div>
	);
}

function GoldChip() {
	const v = useStore(goldAtom);
	return <Chip icon="¤" value={v} tone="gold" title="Gold" />;
}

function LivesChip() {
	const v = useStore(livesAtom);
	const tone = v <= 5 ? 'danger' : 'default';
	return <Chip icon="❤" value={v} tone={tone} title="Lives" />;
}

function WaveChip() {
	const v = useStore(waveAtom);
	return <Chip icon="W" value={v} tone="default" title="Wave" />;
}

function EnemiesChip() {
	const v = useStore(enemiesLeftAtom);
	return <Chip icon="◉" value={v} tone="default" title="Enemies remaining" />;
}

function PowerChip() {
	const supply = useStore(supplyAtom);
	const demand = useStore(demandAtom);
	const tone = supply >= demand ? 'good' : 'danger';
	return (
		<Chip
			icon="⚡"
			value={`${supply}/${demand}`}
			tone={tone}
			title="Power supply / demand"
		/>
	);
}

function BatteryChip() {
	const charge = useStore(batteryChargeAtom);
	const cap = useStore(batteryCapacityAtom);
	if (cap <= 0) return null;
	return (
		<Chip
			icon="◫"
			value={`${Math.floor(charge)}/${cap}`}
			tone="battery"
			title="Battery charge"
		/>
	);
}

function FreeTowerChip() {
	const v = useStore(freeTowersAtom);
	if (v <= 0) return null;
	return <Chip icon="+T" value={v} tone="gold" title="Free basic tower" />;
}

function BountyChip() {
	const v = useStore(bountyMulAtom);
	if (v <= 1) return null;
	return (
		<Chip
			icon="$$"
			value={`×${v.toFixed(1)}`}
			tone="battery"
			title="Bounty multiplier"
		/>
	);
}

function TimerSlot() {
	const state = useStore(timerStateAtom);
	const sec = useStore(timerSecAtom);
	const canSkip = useStore(canSkipAtom);
	const inProgress = state === 'IN_PROGRESS';
	const label = inProgress ? 'WAVE' : 'NEXT';
	const value = inProgress ? 'live' : `${Math.max(0, sec)}s`;
	return (
		<div className="td-timer">
			<div className="td-timer-label">{label}</div>
			<div className="td-timer-value">{value}</div>
			{canSkip ? (
				<button
					type="button"
					className="td-skip"
					onClick={() =>
						skipSignalAtom.set(skipSignalAtom.get() + 1)
					}>
					Skip
					<span className="td-skip-arrow" aria-hidden>
						→
					</span>
				</button>
			) : null}
		</div>
	);
}

function GameOverOverlay() {
	const state = useStore(gameOverAtom);
	if (!state.visible) return null;
	const accent = state.win ? '#48bb78' : '#fc8181';
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
				<TimerSlot />
			</div>
			<GameOverOverlay />
		</div>
	);
}
