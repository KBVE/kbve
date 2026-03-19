import { useRef, useEffect } from 'react';
import { getViews } from '../engine';
import { useAppStore } from '../stores/app';
import { ThemeSwitch } from './ThemeSwitch';

export function Sidebar() {
	const views = getViews();
	const navRef = useRef<HTMLElement>(null);
	const asideRef = useRef<HTMLElement>(null);
	const brandFullRef = useRef<HTMLSpanElement>(null);
	const brandShortRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		const applyActive = (activeId: string) => {
			if (!navRef.current) return;
			const buttons = navRef.current.children;
			for (let i = 0; i < buttons.length; i++) {
				const btn = buttons[i] as HTMLElement;
				const isActive = btn.dataset.viewId === activeId;
				btn.style.backgroundColor = isActive
					? 'var(--color-active)'
					: 'transparent';
				btn.style.color = isActive
					? 'var(--color-text)'
					: 'var(--color-text-muted)';
			}
		};

		const applyCollapse = (open: boolean) => {
			if (!asideRef.current) return;
			asideRef.current.style.width = open ? '15rem' : '5rem';

			// Brand: crossfade "KBVE Desktop" ↔ "K"
			if (brandFullRef.current && brandShortRef.current) {
				brandFullRef.current.style.opacity = open ? '1' : '0';
				brandFullRef.current.style.maxWidth = open ? '12rem' : '0';
				brandFullRef.current.style.overflow = 'hidden';
				brandShortRef.current.style.opacity = open ? '0' : '1';
				brandShortRef.current.style.maxWidth = open ? '0' : '3rem';
				brandShortRef.current.style.overflow = 'hidden';
			}

			// Nav labels
			const labels = asideRef.current.querySelectorAll<HTMLElement>(
				'[data-sidebar-label]',
			);
			labels.forEach((el) => {
				if (open) {
					el.style.opacity = '1';
					el.style.maxWidth = '10rem';
					el.style.marginLeft = '';
				} else {
					el.style.opacity = '0';
					el.style.maxWidth = '0';
					el.style.marginLeft = '0';
				}
			});
		};

		const state = useAppStore.getState();
		applyActive(state.activeView);
		applyCollapse(state.sidebarOpen);

		return useAppStore.subscribe((state, prev) => {
			if (state.activeView !== prev.activeView) {
				applyActive(state.activeView);
			}
			if (state.sidebarOpen !== prev.sidebarOpen) {
				applyCollapse(state.sidebarOpen);
			}
		});
	}, []);

	const { setActiveView, toggleSidebar } = useAppStore.getState();

	return (
		<aside
			ref={asideRef}
			className="flex flex-col border-r transition-all duration-200"
			style={{
				width: '15rem',
				backgroundColor: 'var(--color-surface)',
				borderColor: 'var(--color-border)',
			}}>
			{/* Brand + burger */}
			<div className="sidebar-section flex items-center justify-between">
				<div
					className="relative flex items-center"
					style={{ minHeight: '1.5rem' }}>
					<span
						ref={brandFullRef}
						className="sidebar-label font-display text-heading font-semibold tracking-wide"
						style={{
							color: 'var(--color-text)',
							whiteSpace: 'nowrap',
						}}>
						KBVE Desktop
					</span>
					<span
						ref={brandShortRef}
						className="sidebar-label font-display text-heading font-semibold"
						style={{
							color: 'var(--color-text)',
							opacity: 0,
							maxWidth: 0,
						}}>
						K
					</span>
				</div>
				<BurgerToggle onClick={toggleSidebar} />
			</div>

			{/* Nav items */}
			<nav
				ref={navRef}
				className="sidebar-nav flex flex-1 flex-col gap-1.5">
				{views.map((view) => (
					<button
						key={view.id}
						data-view-id={view.id}
						onClick={() => setActiveView(view.id)}
						className="flex items-center gap-4 rounded-lg px-4 py-3 text-caption transition-colors"
						style={{
							backgroundColor: 'transparent',
							color: 'var(--color-text-muted)',
						}}
						title={view.label}>
						<span className="flex-shrink-0">{view.icon}</span>
						<span data-sidebar-label className="sidebar-label">
							{view.label}
						</span>
					</button>
				))}
			</nav>

			{/* Footer */}
			<div
				className="sidebar-section flex items-center justify-between border-t"
				style={{ borderColor: 'var(--color-border)' }}>
				<p
					data-sidebar-label
					className="sidebar-label text-small"
					style={{ color: 'var(--color-text-muted)' }}>
					v0.1.0
				</p>
				<ThemeSwitch />
			</div>
		</aside>
	);
}

function BurgerToggle({ onClick }: { onClick: () => void }) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		// Sync checkbox to store — checked = collapsed (X shape)
		const apply = (open: boolean) => {
			if (inputRef.current) {
				inputRef.current.checked = !open;
			}
		};
		apply(useAppStore.getState().sidebarOpen);

		return useAppStore.subscribe((state, prev) => {
			if (state.sidebarOpen !== prev.sidebarOpen) {
				apply(state.sidebarOpen);
			}
		});
	}, []);

	return (
		<label
			className="burger"
			onClick={(e) => {
				e.preventDefault();
				onClick();
			}}>
			<input ref={inputRef} type="checkbox" />
			<span />
			<span />
			<span />
		</label>
	);
}
