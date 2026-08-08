import { useEffect, useState } from 'react';
import { DevOpsLayout } from '../components/settings/devops/DevOpsLayout';
import { SettingsCard } from '../components/SettingsCard';
import { SettingsRow } from '../components/SettingsRow';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { ViewTabs } from '../components/ViewTabs';
import { TerminalView } from './terminal';
import { commands } from '../bindings';

function OperationsTab() {
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
		<>
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
		</>
	);
}

export function DevOpsView() {
	return (
		<ViewTabs
			tabs={[
				{
					id: 'ops',
					label: 'Operations',
					content: <OperationsTab />,
				},
				{
					id: 'terminal',
					label: 'Terminal',
					content: <TerminalView />,
				},
			]}
		/>
	);
}
