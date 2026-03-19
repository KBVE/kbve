import { SettingsCard } from '../components/SettingsCard';
import { SettingsRow } from '../components/SettingsRow';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { ViewStatusBadge } from '../components/ViewStatus';
import { Slot } from '../engine';
import { useViewBridge } from '../engine/use-view-bridge';
import { useSettingsStore } from '../stores/settings';

export function GeneralView() {
	const bridge = useViewBridge('general');

	return (
		<div className="flex max-w-2xl flex-col gap-6">
			<div className="flex items-center justify-between">
				<ViewStatusBadge status={bridge.status} />
				{bridge.loading && (
					<span
						className="text-xs"
						style={{ color: 'var(--color-text-muted)' }}>
						Connecting...
					</span>
				)}
			</div>

			<SettingsCard title="Appearance">
				<SettingsRow
					label="Theme"
					description="Select the application color scheme">
					<ThemeSelect />
				</SettingsRow>
			</SettingsCard>

			<SettingsCard title="Startup">
				<SettingsRow
					label="Launch at login"
					description="Automatically start the app when you log in">
					<LaunchToggle />
				</SettingsRow>
				<SettingsRow
					label="Start minimized"
					description="Start the app in the system tray">
					<MinimizedToggle />
				</SettingsRow>
			</SettingsCard>

			<SettingsCard title="Language">
				<SettingsRow
					label="Interface language"
					description="Choose the display language">
					<Slot
						store={useSettingsStore}
						select={(s) => s.language}
						render={(lang) => (lang === 'en' ? 'English' : lang)}
						tag="span"
						className="rounded-md border px-3 py-1.5 text-sm"
						style={{
							backgroundColor: 'var(--color-bg)',
							borderColor: 'var(--color-border)',
							color: 'var(--color-text)',
						}}
					/>
				</SettingsRow>
			</SettingsCard>
		</div>
	);
}

function ThemeSelect() {
	const setTheme = useSettingsStore((s) => s.setTheme);
	return (
		<select
			className="rounded-md border px-3 py-1.5 text-sm"
			style={{
				backgroundColor: 'var(--color-bg)',
				borderColor: 'var(--color-border)',
				color: 'var(--color-text)',
			}}
			defaultValue={useSettingsStore.getState().theme}
			onChange={(e) =>
				setTheme(e.target.value as 'dark' | 'light' | 'system')
			}>
			<option value="dark">Dark</option>
			<option value="light">Light</option>
			<option value="system">System</option>
		</select>
	);
}

function LaunchToggle() {
	const setLaunchAtLogin = useSettingsStore((s) => s.setLaunchAtLogin);
	return (
		<ToggleSwitch
			checked={useSettingsStore.getState().launchAtLogin}
			onChange={setLaunchAtLogin}
		/>
	);
}

function MinimizedToggle() {
	const setStartMinimized = useSettingsStore((s) => s.setStartMinimized);
	return (
		<ToggleSwitch
			checked={useSettingsStore.getState().startMinimized}
			onChange={setStartMinimized}
		/>
	);
}
