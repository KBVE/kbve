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
				className="border-b px-4 py-3"
				style={{ borderColor: 'var(--color-border)' }}>
				<h2 className="text-sm font-medium">{title}</h2>
			</div>
			{children}
		</div>
	);
}
