import { useEffect, useRef } from 'react';
import { getViews } from './registry';
import { useAppStore } from '../stores/app';

// ─── ViewHost ────────────────────────────────────────────────────────────────
// Mounts ALL views once on init. Base view swaps via CSS display toggle.
// Stacked views (overlays) slide in on top with CSS transitions.
// No React reconciliation on navigation — O(1) swap.

export function ViewHost() {
	const views = getViews();
	const baseRef = useRef<HTMLDivElement>(null);
	const stackRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const baseContainer = baseRef.current;
		const stackContainer = stackRef.current;
		if (!baseContainer || !stackContainer) return;

		const applyBase = (activeId: string) => {
			const children = baseContainer.children;
			for (let i = 0; i < children.length; i++) {
				const el = children[i] as HTMLElement;
				el.style.display =
					el.dataset.viewId === activeId ? 'contents' : 'none';
			}
		};

		const applyStack = (stack: string[]) => {
			const children = stackContainer.children;
			const stackSet = new Set(stack);

			for (let i = 0; i < children.length; i++) {
				const el = children[i] as HTMLElement;
				const viewId = el.dataset.viewId;
				const inStack = viewId !== undefined && stackSet.has(viewId);

				if (inStack) {
					el.style.display = 'block';
					// Trigger enter animation on next frame
					requestAnimationFrame(() => {
						el.classList.add('view-stack-enter');
					});
				} else {
					el.classList.remove('view-stack-enter');
					el.style.display = 'none';
				}
			}

			// Show/hide backdrop
			stackContainer.style.pointerEvents =
				stack.length > 0 ? 'auto' : 'none';
			stackContainer.style.opacity = stack.length > 0 ? '1' : '0';
		};

		// Apply initial state
		const state = useAppStore.getState();
		applyBase(state.activeView);
		applyStack(state.viewStack);

		return useAppStore.subscribe((state, prev) => {
			if (state.activeView !== prev.activeView) {
				applyBase(state.activeView);
			}
			if (state.viewStack !== prev.viewStack) {
				applyStack(state.viewStack);
			}
		});
	}, []);

	return (
		<div className="relative flex-1 overflow-hidden">
			{/* Base view layer */}
			<div ref={baseRef} className="view-base h-full overflow-y-auto p-6">
				{views.map((view) => (
					<div
						key={view.id}
						data-view-id={view.id}
						style={{ display: 'none' }}>
						<view.component />
					</div>
				))}
			</div>

			{/* Stack layer (overlays/modals) */}
			<div
				ref={stackRef}
				className="view-stack-backdrop"
				style={{ pointerEvents: 'none', opacity: '0' }}
				onClick={(e) => {
					// Click on backdrop (not on a stacked view) pops the stack
					if (e.target === e.currentTarget) {
						useAppStore.getState().popView();
					}
				}}>
				{views.map((view) => (
					<div
						key={`stack-${view.id}`}
						data-view-id={view.id}
						className="view-stack-panel"
						style={{ display: 'none' }}>
						<div className="view-stack-panel-header">
							<h2 className="text-sm font-semibold">
								{view.label}
							</h2>
							<button
								className="rounded p-1 text-sm transition-colors hover:bg-white/10"
								onClick={() =>
									useAppStore.getState().popView()
								}>
								{'\u2715'}
							</button>
						</div>
						<div className="view-stack-panel-body">
							{/* Stacked views reuse the same component instance —
                                 already mounted in base layer. For truly independent
                                 stacked content, register separate overlay views. */}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
