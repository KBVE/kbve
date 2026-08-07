import { useEffect, useState } from 'react';
import { DevOpsLayout } from '../components/settings/devops/DevOpsLayout';
import { SettingsCard } from '../components/SettingsCard';
import { SettingsRow } from '../components/SettingsRow';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { commands } from '../bindings';

export function DevOpsView() {
	const [voiceEnabled, setVoiceEnabled] = useState(false);

	useEffect(() => {
		void commands
			.agentVoiceIsEnabled()
			.then(setVoiceEnabled)
			.catch(() => undefined);
	}, []);

	const toggleVoice = (checked: boolean) => {
		setVoiceEnabled(checked);
		void commands.agentVoiceSetEnabled(checked).catch(() => undefined);
	};

	return (
		<div className="flex flex-col gap-4">
			<SettingsCard title="Agent voice">
				<SettingsRow
					label="Voice announcements"
					description="Speak agent events (spawns, pull requests) into the connected Discord voice channel, or locally when not connected. Requires a loaded TTS model.">
					<ToggleSwitch
						checked={voiceEnabled}
						onChange={toggleVoice}
					/>
				</SettingsRow>
			</SettingsCard>
			<DevOpsLayout />
		</div>
	);
}
