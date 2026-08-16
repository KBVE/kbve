import { useEffect } from 'react';
import { SettingsCard } from '../components/SettingsCard';
import { SettingsRow } from '../components/SettingsRow';
import { useIotStore } from '../stores/iotStore';

const BACKLIGHT_STEPS = [0, 15, 40, 70, 100];

function formatUptime(seconds: number | null): string {
	if (seconds === null) return '—';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function Telemetry() {
	const snapshot = useIotStore((s) => s.snapshot);
	if (!snapshot?.connected) return null;

	const die = snapshot.die_celsius;
	return (
		<SettingsCard title={snapshot.name ?? 'Board'}>
			<SettingsRow label="Die temperature" description="On-chip sensor">
				<span style={{ fontVariantNumeric: 'tabular-nums' }}>
					{die === null ? '—' : `${die.toFixed(1)} °C`}
				</span>
			</SettingsRow>
			<SettingsRow label="Uptime" description="Since last reset">
				<span style={{ fontVariantNumeric: 'tabular-nums' }}>
					{formatUptime(snapshot.uptime_seconds)}
				</span>
			</SettingsRow>
			<SettingsRow
				label="Button presses"
				description="Counted on the board">
				<span style={{ fontVariantNumeric: 'tabular-nums' }}>
					{snapshot.presses ?? '—'}
				</span>
			</SettingsRow>
		</SettingsCard>
	);
}

function Controls() {
	const snapshot = useIotStore((s) => s.snapshot);
	const setBacklight = useIotStore((s) => s.setBacklight);
	if (!snapshot?.connected) return null;

	const current = snapshot.backlight_pct ?? 0;
	return (
		<SettingsCard title="Controls">
			<SettingsRow
				label="Backlight"
				description="Written straight to the panel. The board's own button stays in sync.">
				<div style={{ display: 'flex', gap: '0.35rem' }}>
					{BACKLIGHT_STEPS.map((pct) => (
						<button
							key={pct}
							type="button"
							onClick={() => void setBacklight(pct)}
							style={{
								padding: '0.25rem 0.6rem',
								borderRadius: 6,
								border: '1px solid var(--color-border)',
								background:
									current === pct
										? 'var(--color-accent)'
										: 'transparent',
								color:
									current === pct
										? 'var(--color-bg)'
										: 'var(--color-text)',
								cursor: 'pointer',
							}}>
							{pct === 0 ? 'Off' : `${pct}%`}
						</button>
					))}
				</div>
			</SettingsRow>
		</SettingsCard>
	);
}

function Devices() {
	const { status, devices, error, scan, connect, disconnect, snapshot } =
		useIotStore();
	const connected = snapshot?.connected ?? false;

	return (
		<SettingsCard title="Devices">
			<SettingsRow
				label="Bluetooth Low Energy"
				description="Scans for nearby KBVE boards. They do not appear in system Bluetooth settings — only apps like this one can see them.">
				<div style={{ display: 'flex', gap: '0.5rem' }}>
					<button
						type="button"
						onClick={() => void scan()}
						disabled={status === 'scanning'}
						style={{
							padding: '0.3rem 0.75rem',
							borderRadius: 6,
							border: '1px solid var(--color-border)',
							background: 'transparent',
							color: 'var(--color-text)',
							cursor: status === 'scanning' ? 'wait' : 'pointer',
						}}>
						{status === 'scanning' ? 'Scanning…' : 'Scan'}
					</button>
					{connected && (
						<button
							type="button"
							onClick={() => void disconnect()}
							style={{
								padding: '0.3rem 0.75rem',
								borderRadius: 6,
								border: '1px solid var(--color-border)',
								background: 'transparent',
								color: 'var(--color-text)',
								cursor: 'pointer',
							}}>
							Disconnect
						</button>
					)}
				</div>
			</SettingsRow>

			{error && (
				<SettingsRow label="Error" description={error}>
					<span />
				</SettingsRow>
			)}

			{devices.map((device) => (
				<SettingsRow
					key={device.id}
					label={device.name}
					description={
						device.rssi === null
							? device.id
							: `${device.rssi} dBm · ${device.id.slice(0, 8)}`
					}>
					<button
						type="button"
						onClick={() => void connect(device.id)}
						disabled={
							status === 'connecting' ||
							snapshot?.device_id === device.id
						}
						style={{
							padding: '0.25rem 0.7rem',
							borderRadius: 6,
							border: '1px solid var(--color-border)',
							background: 'transparent',
							color: 'var(--color-text)',
							cursor: 'pointer',
						}}>
						{snapshot?.device_id === device.id
							? 'Connected'
							: status === 'connecting'
								? 'Connecting…'
								: 'Connect'}
					</button>
				</SettingsRow>
			))}

			{devices.length === 0 && status !== 'scanning' && (
				<SettingsRow
					label="No boards found"
					description="Power a KBVE board and scan again. Check it is advertising and within range.">
					<span />
				</SettingsRow>
			)}
		</SettingsCard>
	);
}

export function IotView() {
	const watch = useIotStore((s) => s.watch);
	const stopWatching = useIotStore((s) => s.stopWatching);

	useEffect(() => {
		void watch();
		return stopWatching;
	}, [watch, stopWatching]);

	return (
		<>
			<Devices />
			<Telemetry />
			<Controls />
		</>
	);
}
