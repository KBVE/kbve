interface SettingsCardProps {
	title: string;
	children: React.ReactNode;
}

export function SettingsCard({ title, children }: SettingsCardProps) {
	return (
		<div
			className="overflow-hidden rounded-xl border"
			style={{
				backgroundColor: 'var(--color-surface)',
				borderColor: 'var(--color-border)',
			}}>
			<div
				className="border-b px-6 py-4"
				style={{ borderColor: 'var(--color-border)' }}>
				<h2
					className="text-caption font-semibold tracking-wide"
					style={{
						color: 'var(--color-text-muted)',
						textTransform: 'uppercase',
						letterSpacing: '0.05em',
					}}>
					{title}
				</h2>
			</div>
			<div className="flex flex-col">{children}</div>
		</div>
	);
}
