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

const COLOR_GOLD = '#fbd38d';
const COLOR_LIVES = '#fc8181';
const COLOR_WAVE = '#90cdf4';
const COLOR_TEXT = '#f7fafc';
const COLOR_POWER_OK = '#9ae6b4';
const COLOR_POWER_LOW = '#fc8181';
const COLOR_BATTERY = '#f6e05e';

interface StatProps {
	label: string;
	value: string | number;
	color: string;
	icon?: string;
}

function Stat({ label, value, color, icon }: StatProps) {
	const style = { '--td-accent': color } as CSSProperties;
	return (
		<div className="td-hud-stat" style={style}>
			<div className="td-hud-stat-label">
				{icon ? <span className="td-hud-stat-icon">{icon}</span> : null}
				{label}
			</div>
			<div className="td-hud-stat-value">{value}</div>
		</div>
	);
}

function GoldStat() {
	const v = useStore(goldAtom);
	return <Stat label="Gold" icon="◆" value={v} color={COLOR_GOLD} />;
}

function LivesStat() {
	const v = useStore(livesAtom);
	return <Stat label="Lives" icon="♥" value={v} color={COLOR_LIVES} />;
}

function WaveStat() {
	const v = useStore(waveAtom);
	return <Stat label="Wave" icon="≡" value={v} color={COLOR_WAVE} />;
}

function EnemiesStat() {
	const v = useStore(enemiesLeftAtom);
	return <Stat label="Enemies" icon="✦" value={v} color={COLOR_TEXT} />;
}

function PowerStat() {
	const supply = useStore(supplyAtom);
	const demand = useStore(demandAtom);
	const color = supply >= demand ? COLOR_POWER_OK : COLOR_POWER_LOW;
	const pct =
		demand > 0
			? Math.min(100, (supply / demand) * 100)
			: supply > 0
				? 100
				: 0;
	const style = { '--td-accent': color } as CSSProperties;
	return (
		<div className="td-hud-stat td-hud-stat-wide" style={style}>
			<div className="td-hud-stat-label">
				<span className="td-hud-stat-icon">⚡</span>
				Power
			</div>
			<div className="td-hud-stat-value">
				{supply}/{demand}
			</div>
			<div className="td-hud-stat-bar">
				<div
					className="td-hud-stat-bar-fill"
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}

function BatteryStat() {
	const charge = useStore(batteryChargeAtom);
	const cap = useStore(batteryCapacityAtom);
	const pct = cap > 0 ? (charge / cap) * 100 : 0;
	const style = { '--td-accent': COLOR_BATTERY } as CSSProperties;
	return (
		<div className="td-hud-stat td-hud-stat-wide" style={style}>
			<div className="td-hud-stat-label">
				<span className="td-hud-stat-icon">🔋</span>
				Battery
			</div>
			<div className="td-hud-stat-value">
				{cap > 0 ? `${Math.floor(charge)}/${cap}` : '—'}
			</div>
			<div className="td-hud-stat-bar">
				<div
					className="td-hud-stat-bar-fill"
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}

function FreeTowerStat() {
	const v = useStore(freeTowersAtom);
	if (v <= 0) return null;
	return <Stat label="Free Tower" icon="✚" value={v} color={COLOR_GOLD} />;
}

function BountyStat() {
	const v = useStore(bountyMulAtom);
	if (v <= 1) return null;
	return (
		<Stat
			label="Bounty"
			icon="★"
			value={`×${v.toFixed(1)}`}
			color={COLOR_BATTERY}
		/>
	);
}

function TimerSlot() {
	const state = useStore(timerStateAtom);
	const sec = useStore(timerSecAtom);
	const canSkip = useStore(canSkipAtom);
	const inProgress = state === 'IN_PROGRESS';
	const label = inProgress ? 'In Progress' : 'Next Wave';
	const value = inProgress ? '⚔' : `${Math.max(0, sec)}s`;
	const color = inProgress ? COLOR_LIVES : COLOR_WAVE;
	const style = { '--td-accent': color } as CSSProperties;
	return (
		<div className="td-hud-timer-slot">
			<div className="td-hud-stat" style={style}>
				<div className="td-hud-stat-label">
					<span className="td-hud-stat-icon">⏱</span>
					{label}
				</div>
				<div className="td-hud-stat-value">{value}</div>
			</div>
			{canSkip ? (
				<button
					type="button"
					className="td-hud-skip-btn"
					onClick={() =>
						skipSignalAtom.set(skipSignalAtom.get() + 1)
					}>
					Skip →
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
		<div className="td-hud-overlay" style={style}>
			<div className="td-hud-overlay-card">
				<div className="td-hud-overlay-eyebrow">
					{state.win ? 'Mission Complete' : 'Mission Failed'}
				</div>
				<div className="td-hud-overlay-text">
					{state.win ? 'Victory' : 'Defeat'}
				</div>
				<div className="td-hud-overlay-sub">
					Cleared {state.wave} {state.wave === 1 ? 'wave' : 'waves'}
				</div>
				<button
					type="button"
					className="td-hud-restart-btn"
					onClick={() =>
						restartSignalAtom.set(restartSignalAtom.get() + 1)
					}>
					Restart
				</button>
				<div className="td-hud-overlay-hint">or press R</div>
			</div>
		</div>
	);
}

export default function TdHud() {
	return (
		<div className="td-hud-root">
			<div className="td-hud-bar">
				<div className="td-hud-left">
					<GoldStat />
					<LivesStat />
					<WaveStat />
					<EnemiesStat />
					<PowerStat />
					<BatteryStat />
					<FreeTowerStat />
					<BountyStat />
				</div>
				<div className="td-hud-right">
					<TimerSlot />
				</div>
			</div>
			<GameOverOverlay />
		</div>
	);
}
