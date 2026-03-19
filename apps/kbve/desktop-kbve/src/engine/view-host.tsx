import { useEffect, useRef } from 'react';
import { getViews } from './registry';
import { useAppStore } from '../stores/app';

// ─── ViewHost ────────────────────────────────────────────────────────────────
// Mounts ALL views once on init. Switches active view via CSS display toggle.
// No React reconciliation on navigation — O(1) swap.

export function ViewHost() {
	const views = getViews();
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		// Subscribe directly to store — bypass React render cycle for view swaps
		const container = containerRef.current;
		if (!container) return;

		const apply = (activeId: string) => {
			const children = container.children;
			for (let i = 0; i < children.length; i++) {
				const el = children[i] as HTMLElement;
				el.style.display =
					el.dataset.viewId === activeId ? 'contents' : 'none';
			}
		};

		// Apply initial state
		apply(useAppStore.getState().activeView);

		// Subscribe for future changes — DOM patch only, no React setState
		return useAppStore.subscribe((state, prev) => {
			if (state.activeView !== prev.activeView) {
				apply(state.activeView);
			}
		});
	}, []);

	return (
		<div ref={containerRef} className="flex-1 overflow-y-auto p-6">
			{views.map((view) => (
				<div
					key={view.id}
					data-view-id={view.id}
					style={{ display: 'none' }}>
					<view.component />
				</div>
			))}
		</div>
	);
}
