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
			className="flex items-center justify-between px-6 py-5 transition-colors"
			onMouseEnter={(e) =>
				(e.currentTarget.style.backgroundColor =
					'var(--color-surface-hover)')
			}
			onMouseLeave={(e) =>
				(e.currentTarget.style.backgroundColor = 'transparent')
			}>
			<div className="flex flex-col gap-1.5">
				<span className="text-body">{label}</span>
				<span
					className="text-caption"
					style={{ color: 'var(--color-text-muted)' }}>
					{description}
				</span>
			</div>
			{children}
		</div>
	);
}
