interface SettingsCardProps {
	title: string;
	children: React.ReactNode;
}

export function SettingsCard({ title, children }: SettingsCardProps) {
	return (
		<section className="flex flex-col gap-3">
			<h2
				className="text-caption px-1 font-semibold"
				style={{
					color: 'var(--color-text-muted)',
					textTransform: 'uppercase',
					letterSpacing: '0.06em',
				}}>
				{title}
			</h2>
			<div
				className="settings-card overflow-hidden rounded-xl border"
				style={{
					backgroundColor: 'var(--color-surface)',
					borderColor: 'var(--color-border)',
				}}>
				{children}
			</div>
		</section>
	);
}
