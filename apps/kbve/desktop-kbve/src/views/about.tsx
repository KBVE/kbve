import { SettingsCard } from '../components/SettingsCard';

export function AboutView() {
	return (
		<div className="flex max-w-2xl flex-col gap-6">
			<SettingsCard title="KBVE Desktop">
				<div className="flex flex-col gap-2 px-4 pb-4">
					<p
						className="text-sm"
						style={{ color: 'var(--color-text-muted)' }}>
						Version 0.1.0
					</p>
					<p
						className="text-sm"
						style={{ color: 'var(--color-text-muted)' }}>
						A cross-platform desktop application built with Tauri,
						React, and Rust.
					</p>
					<p
						className="text-sm"
						style={{ color: 'var(--color-text-muted)' }}>
						MIT License
					</p>
				</div>
			</SettingsCard>
		</div>
	);
}
