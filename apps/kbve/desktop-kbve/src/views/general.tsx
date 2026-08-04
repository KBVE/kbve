import { SettingsCard } from '../components/SettingsCard';
import { SettingsRow } from '../components/SettingsRow';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { useSettingsStore } from '../stores/settings';

export function GeneralView() {
	return (
		<div className="view-column">
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
					<LanguageSelect />
				</SettingsRow>
			</SettingsCard>
		</div>
	);
}

function ThemeSelect() {
	const setTheme = useSettingsStore((s) => s.setTheme);
	return (
		<select
			className="control"
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

function LanguageSelect() {
	const setLanguage = useSettingsStore((s) => s.setLanguage);
	return (
		<select
			className="control"
			defaultValue={useSettingsStore.getState().language}
			onChange={(e) => setLanguage(e.target.value)}>
			<option value="en">English</option>
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
