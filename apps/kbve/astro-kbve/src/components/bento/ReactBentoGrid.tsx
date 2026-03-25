/**
 * ReactBentoGrid — Interactive bento dashboard powered by react-grid-layout.
 *
 * Hydrates on top of Astro-rendered card content. On mount, reads
 * card HTML from hidden DOM containers ([data-bento-id]), then
 * takes over layout with drag, resize, and hide/show.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { useStore } from '@nanostores/react';
import {
	$bentoLayout,
	$hiddenCardIds,
	$editMode,
	initBentoLayout,
	updateLayout,
	hideCard,
	type BentoCardDef,
	type BentoLayoutItem,
} from './bentoStore';
import './bento-grid.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

// ── Lucide icon paths (same as BentoGrid.astro) ──

const ICON_PATHS: Record<string, string[]> = {
	'trending-up': ['M22 7 13.5 15.5 8.5 10.5 2 17', 'M16 7 22 7 22 13'],
	bitcoin: [
		'M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-6.914-1.218m6.914 1.218-.346 1.966m.693-3.932L14.228 2m-8.02 16.047-1.85-5.52.002-.002c-.484-1.441.084-3.3 1.236-4.044l.003-.002c.965-.622 2.043-.467 2.992-.07m5.636 1.748L5.248 7.96m8.98 1.582 1.696-1.218m-8.742 9.09L5.554 5.57',
	],
	clock: [
		'M12 12 12 8',
		'M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z',
	],
	pickaxe: [
		'M14.531 12.469 6.619 20.38a1 1 0 1 1-3-3l7.912-7.912',
		'M15.686 4.314A12.5 12.5 0 0 0 5.461 2.958 1 1 0 0 0 5.58 4.71a22 22 0 0 1 6.318 3.393',
		'M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z',
		'M19.686 8.314a12.5 12.5 0 0 1 1.356 10.225 1 1 0 0 1-1.751-.119 22 22 0 0 0-3.393-6.318',
	],
	wallet: [
		'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
		'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
	],
	zap: [
		'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
	],
	landmark: [
		'M3 22h18',
		'M6 18v-7',
		'M10 18v-7',
		'M14 18v-7',
		'M18 18v-7',
		'M12 2 20 7 4 7z',
	],
	'bar-chart-3': ['M3 3v18h18', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
	hourglass: [
		'M5 22h14',
		'M5 2h14',
		'M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22',
		'M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2',
	],
	'file-text': [
		'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z',
		'M14 2v4a2 2 0 0 0 2 2h4',
		'M10 9H8',
		'M16 13H8',
		'M16 17H8',
	],
};

function LucideIcon({ name, size = 18 }: { name: string; size?: number }) {
	const paths = ICON_PATHS[name];
	if (!paths) return null;
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
			strokeLinecap="round"
			strokeLinejoin="round">
			{paths.map((d, i) => (
				<path key={i} d={d} />
			))}
		</svg>
	);
}

// ── Types ──

interface CardData {
	meta: BentoCardDef;
	html: string;
}

interface Props {
	pageKey: string;
	defaultLayout?: BentoLayoutItem[];
}

// ── Main Component ──

export default function ReactBentoGrid({ pageKey, defaultLayout }: Props) {
	const layout = useStore($bentoLayout);
	const hiddenIds = useStore($hiddenCardIds);
	const editMode = useStore($editMode);

	const cardsRef = useRef<Map<string, CardData>>(new Map());
	const [ready, setReady] = useState(false);
	// Per-card unlock state (local — doesn't affect RGL static prop)
	const [cardUnlocked, setCardUnlocked] = useState<Set<string>>(new Set());

	const toggleCardLock = useCallback((id: string) => {
		setCardUnlocked((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	// Clear per-card unlocks when global edit mode is turned off
	useEffect(() => {
		if (!editMode) {
			setCardUnlocked(new Set());
		}
	}, [editMode]);

	// On mount: read card data from hidden Astro-rendered containers
	useEffect(() => {
		const els = document.querySelectorAll<HTMLElement>('[data-bento-id]');
		const cardDefs: BentoCardDef[] = [];

		els.forEach((el) => {
			const id = el.dataset.bentoId!;
			const meta = JSON.parse(
				el.dataset.bentoMeta || '{}',
			) as BentoCardDef;
			meta.bentoId = id;

			cardsRef.current.set(id, {
				meta,
				html: el.innerHTML,
			});
			cardDefs.push(meta);

			// Hide the Astro container now that React owns the content
			el.style.display = 'none';
		});

		initBentoLayout(pageKey, cardDefs, defaultLayout);
		setReady(true);
	}, [pageKey, defaultLayout]);

	const handleLayoutChange = useCallback(
		(newLayout: ReactGridLayout.Layout[]) => {
			const mapped: BentoLayoutItem[] = newLayout.map((l) => ({
				i: l.i,
				x: l.x,
				y: l.y,
				w: l.w,
				h: l.h,
				minW: l.minW,
				minH: l.minH,
			}));
			updateLayout(mapped);
		},
		[],
	);

	// Refresh TradingView iframes after resize to prevent stale/frozen state
	const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleResizeStop = useCallback(() => {
		// Debounce: wait 300ms after last resize event, then refresh iframes
		if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
		resizeTimerRef.current = setTimeout(() => {
			const iframes = document.querySelectorAll<HTMLIFrameElement>(
				'.bento-card-rgl-content iframe',
			);
			iframes.forEach((iframe) => {
				// Trigger a re-layout by briefly hiding and showing
				const src = iframe.src;
				if (src) {
					iframe.src = '';
					// Use rAF to ensure the browser processes the clear
					requestAnimationFrame(() => {
						iframe.src = src;
					});
				}
			});
		}, 300);
	}, []);

	if (!ready) return null;

	const visibleCards = layout
		.filter((l) => !hiddenIds.includes(l.i))
		.map((l) => {
			const card = cardsRef.current.get(l.i);
			return card ? { layout: l, ...card } : null;
		})
		.filter(Boolean) as Array<{
		layout: BentoLayoutItem;
		meta: BentoCardDef;
		html: string;
	}>;

	return (
		<div className="not-content bento-rgl-container">
			{/* Grid */}
			<ResponsiveGridLayout
				layouts={{ lg: layout, md: layout, sm: layout }}
				breakpoints={{ lg: 1024, md: 641, sm: 0 }}
				cols={{ lg: 4, md: 2, sm: 1 }}
				rowHeight={176}
				margin={[14, 14]}
				isDraggable={editMode}
				isResizable={editMode}
				compactType="vertical"
				draggableHandle=".bento-drag-handle"
				onLayoutChange={handleLayoutChange}
				onResizeStop={handleResizeStop}
				useCSSTransforms>
				{visibleCards.map(({ layout: l, meta, html }) => {
					const isUnlocked = editMode && cardUnlocked.has(l.i);
					return (
						<div key={l.i} data-grid={l}>
							<div
								className={`bento-card-rgl bg-gradient-to-br ${meta.bentoColor || 'from-zinc-700/30 to-zinc-900/60'} ${isUnlocked ? 'bento-card-unlocked' : ''}`}>
								{/* Per-card hover controls — top-right corner */}
								<div
									className={`bento-card-controls ${isUnlocked ? 'bento-card-controls-expanded' : ''}`}>
									{isUnlocked && (
										<>
											{/* X — stash to sidebar (far left) */}
											<button
												className="bento-card-ctrl-btn bento-card-ctrl-hide"
												onClick={(e) => {
													e.stopPropagation();
													hideCard(l.i);
												}}
												title="Stash to sidebar">
												<svg
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
													strokeLinecap="round"
													strokeLinejoin="round">
													<path d="M18 6 6 18" />
													<path d="M6 6 18 18" />
												</svg>
											</button>

											{/* Drag handle */}
											<button
												className="bento-card-ctrl-btn bento-drag-handle"
												title="Drag to reorder">
												<svg
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
													strokeLinecap="round"
													strokeLinejoin="round">
													<circle
														cx="9"
														cy="6"
														r="1"
													/>
													<circle
														cx="15"
														cy="6"
														r="1"
													/>
													<circle
														cx="9"
														cy="12"
														r="1"
													/>
													<circle
														cx="15"
														cy="12"
														r="1"
													/>
													<circle
														cx="9"
														cy="18"
														r="1"
													/>
													<circle
														cx="15"
														cy="18"
														r="1"
													/>
												</svg>
											</button>
										</>
									)}

									{/* Lock/Unlock toggle (always rightmost) */}
									<button
										className={`bento-card-ctrl-btn ${isUnlocked ? 'bento-card-ctrl-unlocked' : ''}`}
										onClick={(e) => {
											e.stopPropagation();
											if (editMode) toggleCardLock(l.i);
										}}
										title={
											!editMode
												? 'Locked — open right sidebar and click Unlock first'
												: isUnlocked
													? 'Unlocked — click to lock'
													: 'Locked — click to unlock'
										}
										style={{ opacity: editMode ? 1 : 0.5 }}>
										{isUnlocked ? (
											<svg
												width="12"
												height="12"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round">
												<rect
													width="18"
													height="11"
													x="3"
													y="11"
													rx="2"
													ry="2"
												/>
												<path d="M7 11V7a5 5 0 0 1 9.9-1" />
											</svg>
										) : (
											<svg
												width="12"
												height="12"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round">
												<rect
													width="18"
													height="11"
													x="3"
													y="11"
													rx="2"
													ry="2"
												/>
												<path d="M7 11V7a5 5 0 0 1 10 0v4" />
											</svg>
										)}
									</button>
								</div>

								{/* Header */}
								<div className="bento-card-rgl-header">
									{meta.icon && (
										<div className="bento-card-rgl-icon">
											<LucideIcon
												name={meta.icon}
												size={22}
											/>
										</div>
									)}
									<div className="bento-card-rgl-titles">
										<h3 className="bento-card-rgl-title">
											{meta.title}
										</h3>
										{meta.description && (
											<p className="bento-card-rgl-desc">
												{meta.description}
											</p>
										)}
									</div>
								</div>

								<div className="bento-card-rgl-divider" />

								{/* Content from Astro */}
								<div
									className="bento-card-rgl-content"
									dangerouslySetInnerHTML={{ __html: html }}
								/>
							</div>
						</div>
					);
				})}
			</ResponsiveGridLayout>
		</div>
	);
}
