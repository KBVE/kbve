import { useEffect, useRef, useCallback } from 'react';
import { getViews, getView } from './registry';
import { useAppStore, type CardState } from '../stores/app';

// ─── ViewHost ────────────────────────────────────────────────────────────────
// Base views: mount once, swap via CSS display. O(1) navigation.
// Card stack: cascaded panels that slide in from right with depth offsets.
// Cards can be dismissed (swipe/close), minimized (collapse to tray),
// focused (brought to front), or restored from tray.

export function ViewHost() {
	const views = getViews();
	const baseRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const baseContainer = baseRef.current;
		if (!baseContainer) return;

		const applyBase = (activeId: string) => {
			const children = baseContainer.children;
			for (let i = 0; i < children.length; i++) {
				const el = children[i] as HTMLElement;
				el.style.display =
					el.dataset.viewId === activeId ? 'contents' : 'none';
			}
		};

		applyBase(useAppStore.getState().activeView);

		return useAppStore.subscribe((state, prev) => {
			if (state.activeView !== prev.activeView) {
				applyBase(state.activeView);
			}
		});
	}, []);

	return (
		<div className="relative flex-1 overflow-hidden">
			{/* Base view layer */}
			<div
				ref={baseRef}
				className="view-base h-full overflow-y-auto px-10 py-8">
				{views.map((view) => (
					<div
						key={view.id}
						data-view-id={view.id}
						style={{ display: 'none' }}>
						<view.component />
					</div>
				))}
			</div>

			{/* Card stack layer */}
			<CardStack />

			{/* Minimized card tray */}
			<CardTray />
		</div>
	);
}

// ─── CardStack ───────────────────────────────────────────────────────────────
// Renders active (non-minimized) cards as cascaded panels.

function CardStack() {
	const backdropRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const backdrop = backdropRef.current;
		const container = containerRef.current;
		if (!backdrop || !container) return;

		const applyCards = (cards: CardState[]) => {
			const activeCards = cards.filter((c) => !c.minimized);
			const hasCards = activeCards.length > 0;

			// Backdrop
			backdrop.style.pointerEvents = hasCards ? 'auto' : 'none';
			backdrop.style.opacity = hasCards ? '1' : '0';

			// Position each card with cascade offset
			const children = container.children;
			for (let i = 0; i < children.length; i++) {
				const el = children[i] as HTMLElement;
				const viewId = el.dataset.cardId;
				const cardIndex = activeCards.findIndex(
					(c) => c.viewId === viewId,
				);

				if (cardIndex >= 0) {
					const depth = activeCards.length - 1 - cardIndex;
					const isFront = cardIndex === activeCards.length - 1;

					el.style.display = 'flex';
					el.style.zIndex = String(100 + cardIndex);

					// Cascade: offset each card behind the front one
					requestAnimationFrame(() => {
						el.style.transform = `translateX(${depth * -24}px) scale(${1 - depth * 0.02})`;
						el.style.opacity = isFront ? '1' : '0.85';
						el.style.filter = isFront
							? 'none'
							: `brightness(${0.9 - depth * 0.05})`;
						el.classList.add('card-enter');
					});
				} else {
					el.classList.remove('card-enter');
					el.style.display = 'none';
				}
			}
		};

		applyCards(useAppStore.getState().cardStack);

		return useAppStore.subscribe((state, prev) => {
			if (state.cardStack !== prev.cardStack) {
				applyCards(state.cardStack);
			}
		});
	}, []);

	const views = getViews();
	const { dismissCard, popCard } = useAppStore.getState();

	return (
		<>
			{/* Backdrop */}
			<div
				ref={backdropRef}
				className="card-backdrop"
				style={{ pointerEvents: 'none', opacity: '0' }}
				onClick={() => popCard()}
			/>

			{/* Card container */}
			<div ref={containerRef} className="card-container">
				{views.map((view) => (
					<CardPanel
						key={`card-${view.id}`}
						viewId={view.id}
						label={view.label}
						onDismiss={() => dismissCard(view.id)}
					/>
				))}
			</div>
		</>
	);
}

// ─── CardPanel ───────────────────────────────────────────────────────────────
// Individual card with swipe-to-dismiss gesture.

function CardPanel({
	viewId,
	label,
	onDismiss,
}: {
	viewId: string;
	label: string;
	onDismiss: () => void;
}) {
	const cardRef = useRef<HTMLDivElement>(null);
	const dragState = useRef({
		dragging: false,
		startX: 0,
		startY: 0,
		currentX: 0,
	});

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		const header = (e.target as HTMLElement).closest('.card-header');
		if (!header) return;

		dragState.current = {
			dragging: true,
			startX: e.clientX,
			startY: e.clientY,
			currentX: 0,
		};
		cardRef.current?.setPointerCapture(e.pointerId);
		cardRef.current?.classList.add('card-dragging');
	}, []);

	const handlePointerMove = useCallback((e: React.PointerEvent) => {
		if (!dragState.current.dragging || !cardRef.current) return;

		const dx = e.clientX - dragState.current.startX;
		// Only allow dragging right (toward dismiss)
		const clampedDx = Math.max(0, dx);
		dragState.current.currentX = clampedDx;

		const progress = Math.min(clampedDx / 200, 1);
		cardRef.current.style.transform = `translateX(${clampedDx}px) scale(${1 - progress * 0.05})`;
		cardRef.current.style.opacity = String(1 - progress * 0.5);
	}, []);

	const handlePointerUp = useCallback(
		(e: React.PointerEvent) => {
			if (!dragState.current.dragging || !cardRef.current) return;

			cardRef.current.releasePointerCapture(e.pointerId);
			cardRef.current.classList.remove('card-dragging');

			const dx = dragState.current.currentX;
			dragState.current.dragging = false;

			if (dx > 120) {
				// Dismiss threshold reached — animate out then remove
				cardRef.current.style.transition =
					'transform 200ms ease-out, opacity 200ms ease-out';
				cardRef.current.style.transform = 'translateX(110%)';
				cardRef.current.style.opacity = '0';
				setTimeout(onDismiss, 200);
			} else {
				// Snap back
				cardRef.current.style.transition =
					'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease-out';
				cardRef.current.style.transform = '';
				cardRef.current.style.opacity = '';
				// Clean up inline transition after animation
				setTimeout(() => {
					if (cardRef.current) {
						cardRef.current.style.transition = '';
					}
				}, 300);
			}
		},
		[onDismiss],
	);

	const { minimizeCard, focusCard } = useAppStore.getState();

	return (
		<div
			ref={cardRef}
			data-card-id={viewId}
			className="card-panel"
			style={{ display: 'none' }}
			onClick={() => focusCard(viewId)}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}>
			<div className="card-header">
				<h2 className="text-body font-semibold">{label}</h2>
				<div className="flex items-center gap-1">
					<button
						className="card-btn"
						onClick={(e) => {
							e.stopPropagation();
							minimizeCard(viewId);
						}}
						title="Minimize">
						{'\u2013'}
					</button>
					<button
						className="card-btn"
						onClick={(e) => {
							e.stopPropagation();
							onDismiss();
						}}
						title="Close">
						{'\u2715'}
					</button>
				</div>
			</div>
			<CardContent viewId={viewId} />
		</div>
	);
}

// ─── CardContent ─────────────────────────────────────────────────────────────
// Renders the actual view component inside a card panel.

function CardContent({ viewId }: { viewId: string }) {
	const view = getView(viewId);
	if (!view) return null;

	const Component = view.component;
	return (
		<div className="card-body">
			<Component />
		</div>
	);
}

// ─── CardTray ────────────────────────────────────────────────────────────────
// Minimized cards appear as pills at the bottom of the viewport.

function CardTray() {
	const trayRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const tray = trayRef.current;
		if (!tray) return;

		const applyTray = (cards: CardState[]) => {
			const minimized = cards.filter((c) => c.minimized);
			tray.style.display = minimized.length > 0 ? 'flex' : 'none';

			const children = tray.children;
			for (let i = 0; i < children.length; i++) {
				const el = children[i] as HTMLElement;
				const viewId = el.dataset.trayId;
				const inTray = minimized.some((c) => c.viewId === viewId);
				el.style.display = inTray ? 'flex' : 'none';
			}
		};

		applyTray(useAppStore.getState().cardStack);

		return useAppStore.subscribe((state, prev) => {
			if (state.cardStack !== prev.cardStack) {
				applyTray(state.cardStack);
			}
		});
	}, []);

	const views = getViews();
	const { restoreCard, dismissCard } = useAppStore.getState();

	return (
		<div ref={trayRef} className="card-tray" style={{ display: 'none' }}>
			{views.map((view) => (
				<div
					key={`tray-${view.id}`}
					data-tray-id={view.id}
					className="card-tray-pill"
					style={{ display: 'none' }}
					onClick={() => restoreCard(view.id)}>
					{view.icon}
					<span className="text-caption">{view.label}</span>
					<button
						className="card-tray-close"
						onClick={(e) => {
							e.stopPropagation();
							dismissCard(view.id);
						}}>
						{'\u2715'}
					</button>
				</div>
			))}
		</div>
	);
}
