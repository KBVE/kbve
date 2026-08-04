import { memo } from 'react';
import { getViews } from '../engine';
import { useAppStore } from '../stores/app';
import { ThemeSwitch } from './ThemeSwitch';
import { Account } from './Account';

const collapsible = (open: boolean, maxWidth: string) =>
	[
		'sidebar-label',
		open
			? `${maxWidth} opacity-100`
			: 'pointer-events-none max-w-0 opacity-0',
	].join(' ');

export function Sidebar() {
	const activeView = useAppStore((s) => s.activeView);
	const sidebarOpen = useAppStore((s) => s.sidebarOpen);
	const setActiveView = useAppStore((s) => s.setActiveView);
	const toggleSidebar = useAppStore((s) => s.toggleSidebar);

	const views = getViews();

	return (
		<aside
			className={[
				'flex flex-shrink-0 flex-col border-r',
				'transition-[width] duration-200 ease-out',
				sidebarOpen ? 'w-60' : 'w-20 sidebar-collapsed',
			].join(' ')}
			style={{
				backgroundColor: 'var(--color-surface)',
				borderColor: 'var(--color-border)',
			}}>
			<header
				className={[
					'sidebar-section flex items-center',
					sidebarOpen ? 'justify-between' : 'justify-center',
				].join(' ')}>
				{sidebarOpen && (
					<span
						className="font-display text-heading font-semibold tracking-wide truncate"
						style={{ color: 'var(--color-text)' }}>
						KBVE Desktop
					</span>
				)}
				<BurgerToggle open={sidebarOpen} onClick={toggleSidebar} />
			</header>

			<nav
				aria-label="Primary navigation"
				className="sidebar-nav flex flex-1 flex-col gap-1.5">
				{views.map((view) => (
					<SidebarItem
						key={view.id}
						id={view.id}
						label={view.label}
						icon={view.icon}
						active={activeView === view.id}
						sidebarOpen={sidebarOpen}
						onSelect={setActiveView}
					/>
				))}
			</nav>

			<Account collapsed={!sidebarOpen} />

			<footer
				className={[
					'sidebar-section flex items-center border-t',
					sidebarOpen ? 'justify-between' : 'justify-center',
				].join(' ')}
				style={{ borderColor: 'var(--color-border)' }}>
				{sidebarOpen && (
					<p
						className="text-small"
						style={{ color: 'var(--color-text-muted)' }}>
						v0.1.0
					</p>
				)}
				<ThemeSwitch />
			</footer>
		</aside>
	);
}

interface SidebarItemProps {
	id: string;
	label: string;
	icon: React.ReactNode;
	active: boolean;
	sidebarOpen: boolean;
	onSelect: (id: string) => void;
}

const SidebarItem = memo(function SidebarItem({
	id,
	label,
	icon,
	active,
	sidebarOpen,
	onSelect,
}: SidebarItemProps) {
	return (
		<button
			type="button"
			aria-current={active ? 'page' : undefined}
			onClick={() => onSelect(id)}
			title={label}
			className={[
				'sidebar-item flex min-w-0 items-center gap-4 rounded-lg px-4 py-3',
				'text-caption transition-colors',
				active ? 'is-active' : '',
			].join(' ')}>
			<span aria-hidden="true" className="sidebar-icon">
				{icon}
			</span>
			<span className={collapsible(sidebarOpen, 'max-w-40')}>
				{label}
			</span>
		</button>
	);
});

function BurgerToggle({
	open,
	onClick,
}: {
	open: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
			aria-expanded={open}
			onClick={onClick}
			className="burger">
			<span />
			<span />
			<span />
		</button>
	);
}
