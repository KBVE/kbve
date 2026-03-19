import type { Page } from '../App';

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
	{ id: 'general', label: 'General', icon: '⚙' },
	{ id: 'audio', label: 'Audio', icon: '🎙' },
	{ id: 'models', label: 'Models', icon: '🧠' },
	{ id: 'shortcuts', label: 'Shortcuts', icon: '⌨' },
	{ id: 'about', label: 'About', icon: 'ℹ' },
];

interface SidebarProps {
	currentPage: Page;
	onNavigate: (page: Page) => void;
	isOpen: boolean;
	onToggle: () => void;
}

export function Sidebar({
	currentPage,
	onNavigate,
	isOpen,
	onToggle,
}: SidebarProps) {
	return (
		<aside
			className={`flex flex-col border-r transition-all duration-200 ${
				isOpen ? 'w-56' : 'w-14'
			}`}
			style={{
				backgroundColor: 'var(--color-surface)',
				borderColor: 'var(--color-border)',
			}}>
			<div className="flex items-center justify-between p-3">
				{isOpen && (
					<span className="text-sm font-semibold tracking-wide opacity-70">
						KBVE
					</span>
				)}
				<button
					onClick={onToggle}
					className="rounded p-1 text-sm transition-colors hover:bg-white/10"
					aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
					{isOpen ? '◀' : '▶'}
				</button>
			</div>

			<nav className="mt-2 flex flex-1 flex-col gap-1 px-2">
				{NAV_ITEMS.map((item) => (
					<button
						key={item.id}
						onClick={() => onNavigate(item.id)}
						className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
							currentPage === item.id
								? 'font-medium'
								: 'opacity-60 hover:opacity-100'
						}`}
						style={{
							backgroundColor:
								currentPage === item.id
									? 'var(--color-accent)'
									: 'transparent',
						}}
						title={item.label}>
						<span className="text-base">{item.icon}</span>
						{isOpen && <span>{item.label}</span>}
					</button>
				))}
			</nav>

			<div
				className="border-t p-3"
				style={{ borderColor: 'var(--color-border)' }}>
				{isOpen && (
					<p
						className="text-xs"
						style={{ color: 'var(--color-text-muted)' }}>
						v0.1.0
					</p>
				)}
			</div>
		</aside>
	);
}
