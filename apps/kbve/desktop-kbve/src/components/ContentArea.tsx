import type { Page } from '../App';

interface ContentAreaProps {
	currentPage: Page;
	sidebarOpen: boolean;
}

const PAGE_TITLES: Record<Page, string> = {
	general: 'General Settings',
	audio: 'Audio Configuration',
	models: 'Model Management',
	shortcuts: 'Keyboard Shortcuts',
	about: 'About',
};

export function ContentArea({ currentPage }: ContentAreaProps) {
	return (
		<main className="flex flex-1 flex-col overflow-hidden">
			<header
				className="flex items-center border-b px-6 py-4"
				style={{
					backgroundColor: 'var(--color-surface)',
					borderColor: 'var(--color-border)',
				}}>
				<h1 className="text-lg font-semibold">
					{PAGE_TITLES[currentPage]}
				</h1>
			</header>

			<div className="flex-1 overflow-y-auto p-6">
				<PageContent page={currentPage} />
			</div>
		</main>
	);
}

function PageContent({ page }: { page: Page }) {
	switch (page) {
		case 'general':
			return <GeneralPage />;
		case 'audio':
			return (
				<PlaceholderPage
					title="Audio"
					description="Audio device selection and recording settings will appear here."
				/>
			);
		case 'models':
			return (
				<PlaceholderPage
					title="Models"
					description="Speech-to-text model downloads and selection will appear here."
				/>
			);
		case 'shortcuts':
			return (
				<PlaceholderPage
					title="Shortcuts"
					description="Global keyboard shortcut configuration will appear here."
				/>
			);
		case 'about':
			return <AboutPage />;
	}
}

function GeneralPage() {
	return (
		<div className="flex max-w-2xl flex-col gap-6">
			<SettingsCard title="Appearance">
				<SettingsRow
					label="Theme"
					description="Select the application color scheme">
					<select
						className="rounded-md border px-3 py-1.5 text-sm"
						style={{
							backgroundColor: 'var(--color-bg)',
							borderColor: 'var(--color-border)',
							color: 'var(--color-text)',
						}}>
						<option>Dark</option>
						<option>Light</option>
						<option>System</option>
					</select>
				</SettingsRow>
			</SettingsCard>

			<SettingsCard title="Startup">
				<SettingsRow
					label="Launch at login"
					description="Automatically start the app when you log in">
					<ToggleSwitch />
				</SettingsRow>
				<SettingsRow
					label="Start minimized"
					description="Start the app in the system tray">
					<ToggleSwitch />
				</SettingsRow>
			</SettingsCard>

			<SettingsCard title="Language">
				<SettingsRow
					label="Interface language"
					description="Choose the display language">
					<select
						className="rounded-md border px-3 py-1.5 text-sm"
						style={{
							backgroundColor: 'var(--color-bg)',
							borderColor: 'var(--color-border)',
							color: 'var(--color-text)',
						}}>
						<option>English</option>
					</select>
				</SettingsRow>
			</SettingsCard>
		</div>
	);
}

function AboutPage() {
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

function PlaceholderPage({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="flex max-w-2xl flex-col gap-6">
			<SettingsCard title={title}>
				<div className="px-4 pb-4">
					<p
						className="text-sm"
						style={{ color: 'var(--color-text-muted)' }}>
						{description}
					</p>
				</div>
			</SettingsCard>
		</div>
	);
}

function SettingsCard({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div
			className="overflow-hidden rounded-xl border"
			style={{
				backgroundColor: 'var(--color-surface)',
				borderColor: 'var(--color-border)',
			}}>
			<div
				className="border-b px-4 py-3"
				style={{ borderColor: 'var(--color-border)' }}>
				<h2 className="text-sm font-medium">{title}</h2>
			</div>
			{children}
		</div>
	);
}

function SettingsRow({
	label,
	description,
	children,
}: {
	label: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<div
			className="flex items-center justify-between px-4 py-3 transition-colors"
			style={{ '--tw-bg-opacity': '1' } as React.CSSProperties}
			onMouseEnter={(e) =>
				(e.currentTarget.style.backgroundColor =
					'var(--color-surface-hover)')
			}
			onMouseLeave={(e) =>
				(e.currentTarget.style.backgroundColor = 'transparent')
			}>
			<div className="flex flex-col gap-0.5">
				<span className="text-sm">{label}</span>
				<span
					className="text-xs"
					style={{ color: 'var(--color-text-muted)' }}>
					{description}
				</span>
			</div>
			{children}
		</div>
	);
}

function ToggleSwitch() {
	return (
		<button
			className="relative h-6 w-11 rounded-full transition-colors"
			style={{ backgroundColor: 'var(--color-border)' }}
			onClick={(e) => {
				const btn = e.currentTarget;
				const dot = btn.querySelector('span')!;
				const isOn = dot.style.transform === 'translateX(20px)';
				dot.style.transform = isOn
					? 'translateX(2px)'
					: 'translateX(20px)';
				btn.style.backgroundColor = isOn
					? 'var(--color-border)'
					: 'var(--color-accent)';
			}}>
			<span
				className="absolute top-1 block h-4 w-4 rounded-full bg-white shadow transition-transform"
				style={{ transform: 'translateX(2px)' }}
			/>
		</button>
	);
}
