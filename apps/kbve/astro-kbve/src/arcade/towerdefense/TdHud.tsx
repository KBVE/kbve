import { useStore } from '@nanostores/react';
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
const COLOR_DIM = '#a0aec0';
const COLOR_POWER_OK = '#9ae6b4';
const COLOR_POWER_LOW = '#fc8181';
const COLOR_BATTERY = '#f6e05e';

interface StatProps {
	label: string;
	value: string | number;
	color: string;
}

function Stat({ label, value, color }: StatProps) {
	return (
		<div className="td-hud-stat">
			<div className="td-hud-stat-label">{label}</div>
			<div className="td-hud-stat-value" style={{ color }}>
				{value}
			</div>
		</div>
	);
}

function GoldStat() {
	const v = useStore(goldAtom);
	return <Stat label="GOLD" value={v} color={COLOR_GOLD} />;
}

function LivesStat() {
	const v = useStore(livesAtom);
	return <Stat label="LIVES" value={v} color={COLOR_LIVES} />;
}

function WaveStat() {
	const v = useStore(waveAtom);
	return <Stat label="WAVE" value={v} color={COLOR_WAVE} />;
}

function EnemiesStat() {
	const v = useStore(enemiesLeftAtom);
	return <Stat label="ENEMIES" value={v} color={COLOR_TEXT} />;
}

function PowerStat() {
	const supply = useStore(supplyAtom);
	const demand = useStore(demandAtom);
	const color = supply >= demand ? COLOR_POWER_OK : COLOR_POWER_LOW;
	return <Stat label="POWER" value={`${supply}/${demand}`} color={color} />;
}

function BatteryStat() {
	const charge = useStore(batteryChargeAtom);
	const cap = useStore(batteryCapacityAtom);
	return (
		<Stat
			label="BATTERY"
			value={cap > 0 ? `${Math.floor(charge)}/${cap}` : '—'}
			color={COLOR_BATTERY}
		/>
	);
}

function FreeTowerStat() {
	const v = useStore(freeTowersAtom);
	if (v <= 0) return null;
	return <Stat label="FREE TWR" value={v} color={COLOR_GOLD} />;
}

function BountyStat() {
	const v = useStore(bountyMulAtom);
	if (v <= 1) return null;
	return (
		<Stat label="BOUNTY" value={`×${v.toFixed(1)}`} color={COLOR_BATTERY} />
	);
}

function TimerSlot() {
	const state = useStore(timerStateAtom);
	const sec = useStore(timerSecAtom);
	const canSkip = useStore(canSkipAtom);
	const label = state === 'IN_PROGRESS' ? 'IN PROGRESS' : 'NEXT WAVE';
	const value = state === 'IN_PROGRESS' ? '—' : `${Math.max(0, sec)}s`;
	return (
		<div className="td-hud-timer">
			<Stat label={label} value={value} color={COLOR_TEXT} />
			{canSkip ? (
				<button
					type="button"
					className="td-hud-skip-btn"
					onClick={() =>
						skipSignalAtom.set(skipSignalAtom.get() + 1)
					}>
					SKIP →
				</button>
			) : null}
		</div>
	);
}

function GameOverOverlay() {
	const state = useStore(gameOverAtom);
	if (!state.visible) return null;
	return (
		<div className="td-hud-overlay">
			<div
				className="td-hud-overlay-text"
				style={{ color: state.win ? '#48bb78' : '#fc8181' }}>
				{state.win ? 'Victory' : 'Defeat'} — wave {state.wave}
			</div>
			<button
				type="button"
				className="td-hud-restart-btn"
				onClick={() =>
					restartSignalAtom.set(restartSignalAtom.get() + 1)
				}>
				RESTART
			</button>
			<div className="td-hud-overlay-hint">or press R</div>
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
