import { SettingsCard } from '../components/SettingsCard';

export function AboutView() {
	return (
		<div className="view-column">
			<SettingsCard title="KBVE Desktop">
				<div className="flex flex-col gap-2 px-5 py-4">
					<p
						className="text-body"
						style={{ color: 'var(--color-text-muted)' }}>
						Version 0.1.0
					</p>
					<p
						className="text-body"
						style={{ color: 'var(--color-text-muted)' }}>
						A cross-platform desktop application built with Tauri,
						React, and Rust.
					</p>
					<p
						className="text-body"
						style={{ color: 'var(--color-text-muted)' }}>
						MIT License
					</p>
				</div>
			</SettingsCard>
		</div>
	);
}
