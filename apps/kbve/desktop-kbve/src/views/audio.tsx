import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { SettingsCard } from '../components/SettingsCard';
import { SettingsRow } from '../components/SettingsRow';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { commands, type AudioDevice } from '../bindings';

const DEFAULT = '__default__';

export function AudioView() {
	const [mics, setMics] = useState<AudioDevice[]>([]);
	const [outputs, setOutputs] = useState<AudioDevice[]>([]);
	const [selectedMic, setSelectedMic] = useState('');
	const [selectedOut, setSelectedOut] = useState('');
	const [alwaysOn, setAlwaysOn] = useState(false);
	const levelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		(async () => {
			const m = await commands.getAvailableMicrophones();
			if (m.status === 'ok') setMics(m.data);
			const o = await commands.getAvailableOutputDevices();
			if (o.status === 'ok') setOutputs(o.data);
			const sm = await commands.getSelectedMicrophone();
			if (sm.status === 'ok') setSelectedMic(sm.data);
			const so = await commands.getSelectedOutputDevice();
			if (so.status === 'ok') setSelectedOut(so.data);
			const mode = await commands.getMicrophoneMode();
			if (mode.status === 'ok') setAlwaysOn(mode.data);
		})();
	}, []);

	// Live mic level meter driven by the backend "mic-level" event.
	useEffect(() => {
		const unlisten = listen<number[]>('mic-level', (e) => {
			const peak = e.payload.length
				? Math.max(...e.payload.map(Math.abs))
				: 0;
			if (levelRef.current) {
				levelRef.current.style.width = `${Math.min(100, peak * 140)}%`;
			}
		});
		return () => {
			unlisten.then((f) => f());
		};
	}, []);

	return (
		<div className="flex max-w-2xl flex-col gap-6">
			<SettingsCard title="Audio Devices">
				<SettingsRow
					label="Microphone"
					description="Input device used for dictation">
					<DeviceSelect
						devices={mics}
						value={selectedMic}
						onChange={(name) => {
							setSelectedMic(name);
							commands.setSelectedMicrophone(name);
						}}
					/>
				</SettingsRow>
				<SettingsRow
					label="Output device"
					description="Device used for audio feedback sounds">
					<DeviceSelect
						devices={outputs}
						value={selectedOut}
						onChange={(name) => {
							setSelectedOut(name);
							commands.setSelectedOutputDevice(name);
						}}
					/>
				</SettingsRow>
			</SettingsCard>

			<SettingsCard title="Recording">
				<SettingsRow
					label="Always-on microphone"
					description="Keep the mic stream open for faster capture (uses more power)">
					<ToggleSwitch
						checked={alwaysOn}
						onChange={(v) => {
							setAlwaysOn(v);
							commands.updateMicrophoneMode(v);
						}}
					/>
				</SettingsRow>
				<SettingsRow
					label="Input level"
					description="Live microphone level while recording">
					<div
						className="h-2 w-40 overflow-hidden rounded-full"
						style={{ backgroundColor: 'var(--color-border)' }}>
						<div
							ref={levelRef}
							className="h-full transition-[width] duration-75"
							style={{
								width: '0%',
								backgroundColor: 'var(--color-toggle-on)',
							}}
						/>
					</div>
				</SettingsRow>
				<SettingsRow
					label="Test sound"
					description="Play the recording start/stop feedback sound">
					<button
						onClick={() => commands.playTestSound('start')}
						className="rounded-md border px-3 py-1.5 text-caption"
						style={{
							backgroundColor: 'var(--color-bg)',
							borderColor: 'var(--color-border)',
							color: 'var(--color-text)',
						}}>
						Play
					</button>
				</SettingsRow>
			</SettingsCard>
		</div>
	);
}

function DeviceSelect({
	devices,
	value,
	onChange,
}: {
	devices: AudioDevice[];
	value: string;
	onChange: (name: string) => void;
}) {
	return (
		<select
			className="max-w-xs rounded-md border px-3 py-1.5 text-body"
			style={{
				backgroundColor: 'var(--color-bg)',
				borderColor: 'var(--color-border)',
				color: 'var(--color-text)',
			}}
			value={value || DEFAULT}
			onChange={(e) =>
				onChange(e.target.value === DEFAULT ? '' : e.target.value)
			}>
			<option value={DEFAULT}>System default</option>
			{devices.map((d) => (
				<option key={d.index} value={d.name}>
					{d.name}
					{d.is_default ? ' (default)' : ''}
				</option>
			))}
		</select>
	);
}
