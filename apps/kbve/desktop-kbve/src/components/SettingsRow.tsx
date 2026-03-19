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
			className="flex items-center justify-between px-4 py-3 transition-colors"
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
