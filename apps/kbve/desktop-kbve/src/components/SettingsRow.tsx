interface SettingsRowProps {
	label: string;
	description: string;
	children: React.ReactNode;
}

export function SettingsRow({
	label,
	description,
	children,
}: SettingsRowProps) {
	return (
		<div
			className="settings-row flex items-center justify-between gap-6 px-5 py-4 transition-colors"
			onMouseEnter={(e) =>
				(e.currentTarget.style.backgroundColor =
					'var(--color-surface-hover)')
			}
			onMouseLeave={(e) =>
				(e.currentTarget.style.backgroundColor = 'transparent')
			}>
			<div className="flex min-w-0 flex-col gap-1">
				<span className="text-body font-medium">{label}</span>
				<span
					className="text-caption"
					style={{ color: 'var(--color-text-muted)' }}>
					{description}
				</span>
			</div>
			<div className="flex flex-shrink-0 items-center">{children}</div>
		</div>
	);
}
