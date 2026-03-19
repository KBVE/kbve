import { SettingsCard } from '../components/SettingsCard';

export function ShortcutsView() {
	return (
		<div className="flex max-w-2xl flex-col gap-6">
			<SettingsCard title="Keyboard Shortcuts">
				<div className="px-4 pb-4">
					<p
						className="text-sm"
						style={{ color: 'var(--color-text-muted)' }}>
						Global keyboard shortcut configuration will appear here.
					</p>
				</div>
			</SettingsCard>
		</div>
	);
}
