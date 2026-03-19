import { useRef, useEffect } from 'react';
import { getViews } from '../engine';
import { useAppStore } from '../stores/app';

// ─── Sidebar ─────────────────────────────────────────────────────────────────
// Reads view list from registry. Subscribes to app store for active view +
// collapse state. Nav highlight updates via direct DOM patching — no React
// re-render on navigation.

export function Sidebar() {
	const views = getViews();
	const navRef = useRef<HTMLElement>(null);
	const asideRef = useRef<HTMLElement>(null);

	useEffect(() => {
		const applyActive = (activeId: string) => {
			if (!navRef.current) return;
			const buttons = navRef.current.children;
			for (let i = 0; i < buttons.length; i++) {
				const btn = buttons[i] as HTMLElement;
				const isActive = btn.dataset.viewId === activeId;
				btn.style.backgroundColor = isActive
					? 'var(--color-accent)'
					: 'transparent';
				btn.className = btn.className
					.replace(/font-medium|opacity-60 hover:opacity-100/g, '')
					.trim();
				btn.classList.add(isActive ? 'font-medium' : 'opacity-60');
			}
		};

		const applyCollapse = (open: boolean) => {
			if (!asideRef.current) return;
			asideRef.current.style.width = open ? '14rem' : '3.5rem';
			// Toggle label visibility
			const labels = asideRef.current.querySelectorAll<HTMLElement>(
				'[data-sidebar-label]',
			);
			labels.forEach((el) => {
				el.style.display = open ? '' : 'none';
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
				width: '14rem',
				backgroundColor: 'var(--color-surface)',
				borderColor: 'var(--color-border)',
			}}>
			<div className="flex items-center justify-between p-3">
				<span
					data-sidebar-label
					className="text-sm font-semibold tracking-wide opacity-70">
					KBVE
				</span>
				<button
					onClick={toggleSidebar}
					className="rounded p-1 text-sm transition-colors hover:bg-white/10"
					aria-label="Toggle sidebar">
					<ToggleIcon />
				</button>
			</div>

			<nav ref={navRef} className="mt-2 flex flex-1 flex-col gap-1 px-2">
				{views.map((view) => (
					<button
						key={view.id}
						data-view-id={view.id}
						onClick={() => setActiveView(view.id)}
						className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors opacity-60"
						style={{ backgroundColor: 'transparent' }}
						title={view.label}>
						<span className="text-base">{view.icon}</span>
						<span data-sidebar-label>{view.label}</span>
					</button>
				))}
			</nav>

			<div
				className="border-t p-3"
				style={{ borderColor: 'var(--color-border)' }}>
				<p
					data-sidebar-label
					className="text-xs"
					style={{ color: 'var(--color-text-muted)' }}>
					v0.1.0
				</p>
			</div>
		</aside>
	);
}

function ToggleIcon() {
	const ref = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		return useAppStore.subscribe((state, prev) => {
			if (state.sidebarOpen !== prev.sidebarOpen && ref.current) {
				ref.current.textContent = state.sidebarOpen
					? '\u25C0'
					: '\u25B6';
			}
		});
	}, []);

	return <span ref={ref}>{'\u25C0'}</span>;
}
