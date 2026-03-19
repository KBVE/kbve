import { SettingsCard } from '../components/SettingsCard';

export function ModelsView() {
	return (
		<div className="flex max-w-2xl flex-col gap-6">
			<SettingsCard title="Model Management">
				<div className="px-4 pb-4">
					<p
						className="text-sm"
						style={{ color: 'var(--color-text-muted)' }}>
						Speech-to-text model downloads and selection will appear
						here.
					</p>
				</div>
			</SettingsCard>
		</div>
	);
}
