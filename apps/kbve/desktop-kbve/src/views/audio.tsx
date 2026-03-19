import { SettingsCard } from '../components/SettingsCard';

export function AudioView() {
	return (
		<div className="flex max-w-2xl flex-col gap-6">
			<SettingsCard title="Audio Devices">
				<div className="px-4 pb-4">
					<p
						className="text-sm"
						style={{ color: 'var(--color-text-muted)' }}>
						Audio device selection and recording settings will
						appear here.
					</p>
				</div>
			</SettingsCard>
		</div>
	);
}
