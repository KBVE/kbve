/**
 * BentoController — React wraps Astro's static HTML cards with @dnd-kit.
 *
 * React owns the outer grid + card shells (col-span, row-span, order, drag).
 * Astro's real DOM nodes (with live iframes) are moved into React slots
 * via appendChild — never cloned, never destroyed.
 *
 * @dnd-kit handles drag-to-reorder. CSS Grid handles sizing.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import {
	DndContext,
	closestCenter,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragStartEvent,
} from '@dnd-kit/core';
import {
	SortableContext,
	useSortable,
	rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
	$hiddenIds,
	$units,
	initBentoStore,
	hideCard,
	showCard,
	setCardCol,
	setCardRow,
	resetAll,
	type CardUnits,
} from './bentoStore';
import { cn } from '@/lib/utils';

// ── Types ──

interface CardMeta {
	id: string;
	title: string;
	icon: string;
	defaultSize: string;
}

interface Props {
	pageKey: string;
}

// ── Size defaults ──

const SIZE_DEFAULTS: Record<string, { col: number; row: number }> = {
	small: { col: 1, row: 1 },
	medium: { col: 2, row: 2 },
	large: { col: 2, row: 3 },
	wide: { col: 3, row: 1 },
	tall: { col: 1, row: 3 },
};

function getDims(
	id: string,
	units: Record<string, CardUnits>,
	defaultSize: string,
) {
	const u = units[id];
	const col = u?.col || SIZE_DEFAULTS[defaultSize]?.col || 2;
	const row = u?.row || SIZE_DEFAULTS[defaultSize]?.row || 2;
	return { col, row };
}

// ── Iframe safety ──

function disableIframes(el: HTMLElement | null) {
	el?.querySelectorAll('iframe').forEach((f) => {
		f.style.pointerEvents = 'none';
	});
}

function enableIframes(el: HTMLElement | null) {
	el?.querySelectorAll('iframe').forEach((f) => {
		f.style.pointerEvents = '';
	});
}

function refreshIframes(el: HTMLElement | null) {
	if (!el) return;
	disableIframes(el);
	el.querySelectorAll('iframe').forEach((iframe) => {
		iframe.style.display = 'none';
		requestAnimationFrame(() => {
			iframe.style.display = '';
			requestAnimationFrame(() => {
				iframe.style.pointerEvents = '';
			});
		});
	});
}

// ── Sortable Card ──

interface SortableCardProps {
	card: CardMeta;
	col: number;
	row: number;
	isDragging: boolean;
	slotRef: (el: HTMLDivElement | null) => void;
	onHide: () => void;
	onSetCol: (col: number) => void;
	onSetRow: (row: number) => void;
}

function SortableCard({
	card,
	col,
	row,
	isDragging,
	slotRef,
	onHide,
	onSetCol,
	onSetRow,
}: SortableCardProps) {
	const { attributes, listeners, setNodeRef, transform, transition } =
		useSortable({ id: card.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
		position: 'relative' as const,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn('bento-card', `col-span-${col}`, `row-span-${row}`)}>
			{/* Controls overlay */}
			<div className="bento-card-controls-overlay">
				<button
					className="bento-card-ctrl-btn bento-card-ctrl-hide"
					onClick={onHide}
					aria-label={`Hide ${card.title}`}>
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
					{...attributes}
					{...listeners}
					aria-label="Drag to reorder">
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round">
						<circle cx="9" cy="6" r="1" />
						<circle cx="15" cy="6" r="1" />
						<circle cx="9" cy="12" r="1" />
						<circle cx="15" cy="12" r="1" />
						<circle cx="9" cy="18" r="1" />
						<circle cx="15" cy="18" r="1" />
					</svg>
				</button>

				{/* Unit picker */}
				<div className="bento-unit-picker">
					<span className="bento-unit-label">W</span>
					{[1, 2, 3, 4].map((c) => (
						<button
							key={c}
							className={cn(
								'bento-unit-btn',
								c === col && 'active',
							)}
							onClick={() => onSetCol(c)}>
							{c}
						</button>
					))}
					<span className="bento-unit-sep" />
					<span className="bento-unit-label">H</span>
					{[1, 2, 3].map((r) => (
						<button
							key={r}
							className={cn(
								'bento-unit-btn',
								r === row && 'active',
							)}
							onClick={() => onSetRow(r)}>
							{r}
						</button>
					))}
				</div>
			</div>

			{/* Slot for Astro's real DOM node */}
			<div ref={slotRef} className="bento-card-slot" />
		</div>
	);
}

// ── Main Controller ──

export default function BentoController({ pageKey }: Props) {
	const hiddenIds = useStore($hiddenIds);
	const units = useStore($units);
	const [cards, setCards] = useState<CardMeta[]>([]);
	const [order, setOrder] = useState<string[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const slotRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const astroInners = useRef<Map<string, HTMLElement>>(new Map());
	const initRef = useRef(false);

	// Pointer sensor with activation distance to prevent accidental drags
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 8 },
		}),
	);

	// 1. Init store + discover cards
	useEffect(() => {
		if (initRef.current) return;
		initRef.current = true;

		initBentoStore(pageKey);

		const grid = document.querySelector<HTMLElement>(
			`[data-bento-page="${pageKey}"]`,
		);
		if (!grid) return;

		const found: CardMeta[] = [];
		const ids: string[] = [];

		grid.querySelectorAll<HTMLElement>('[data-bento-id]').forEach((el) => {
			const id = el.dataset.bentoId || '';
			found.push({
				id,
				title: el.dataset.bentoTitle || id,
				icon: el.dataset.bentoIcon || 'file-text',
				defaultSize: el.dataset.bentoDefaultSize || 'medium',
			});
			ids.push(id);

			// Stash the .bento-card-inner node
			const inner = el.querySelector<HTMLElement>('.bento-card-inner');
			if (inner) astroInners.current.set(id, inner);
		});

		setCards(found);

		// Load saved order or use default
		try {
			const saved = localStorage.getItem(`bento-order:${pageKey}`);
			if (saved) {
				const parsed = JSON.parse(saved) as string[];
				// Ensure all IDs are present
				const merged = [...parsed.filter((id) => ids.includes(id))];
				ids.forEach((id) => {
					if (!merged.includes(id)) merged.push(id);
				});
				setOrder(merged);
			} else {
				setOrder(ids);
			}
		} catch {
			setOrder(ids);
		}

		// Hide Astro's grid
		grid.style.display = 'none';
	}, [pageKey]);

	// 2. Move Astro inner nodes into React slots
	useEffect(() => {
		if (cards.length === 0) return;

		// Use requestAnimationFrame to ensure React has rendered the slots
		requestAnimationFrame(() => {
			cards.forEach((card) => {
				const slot = slotRefs.current.get(card.id);
				const inner = astroInners.current.get(card.id);
				if (!slot || !inner) return;

				if (inner.parentElement !== slot) {
					slot.appendChild(inner);
				}
			});
		});
	}, [cards, order, hiddenIds]);

	// 3. Notify BentoDock
	useEffect(() => {
		window.dispatchEvent(
			new CustomEvent('bento-hidden-changed', {
				detail: { pageKey, hiddenIds },
			}),
		);
	}, [hiddenIds, pageKey]);

	// 4. Expose API
	useEffect(() => {
		(window as any).__bentoGrid = (window as any).__bentoGrid || {};
		(window as any).__bentoGrid[pageKey] = {
			hide: hideCard,
			show: showCard,
			reset: () => {
				resetAll();
				localStorage.removeItem(`bento-order:${pageKey}`);
				setOrder(cards.map((c) => c.id));
			},
			getHidden: () => $hiddenIds.get(),
		};
	}, [pageKey, cards]);

	// ── Drag handlers ──

	const handleDragStart = useCallback((event: DragStartEvent) => {
		setActiveId(event.active.id as string);
		// Disable all iframes during drag
		slotRefs.current.forEach((el) => disableIframes(el));
	}, []);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			setActiveId(null);
			// Re-enable iframes
			slotRefs.current.forEach((el) => enableIframes(el));

			const { active, over } = event;
			if (!over || active.id === over.id) return;

			setOrder((prev) => {
				const oldIdx = prev.indexOf(active.id as string);
				const newIdx = prev.indexOf(over.id as string);
				if (oldIdx === -1 || newIdx === -1) return prev;

				const next = [...prev];
				next.splice(oldIdx, 1);
				next.splice(newIdx, 0, active.id as string);

				// Persist
				try {
					localStorage.setItem(
						`bento-order:${pageKey}`,
						JSON.stringify(next),
					);
				} catch {
					/* quota */
				}

				return next;
			});
		},
		[pageKey],
	);

	// ── Resize handlers ──

	const handleSetCol = useCallback((id: string, col: number) => {
		setCardCol(id, col);
		setTimeout(() => refreshIframes(slotRefs.current.get(id) || null), 50);
	}, []);

	const handleSetRow = useCallback((id: string, row: number) => {
		setCardRow(id, row);
		setTimeout(() => refreshIframes(slotRefs.current.get(id) || null), 50);
	}, []);

	if (cards.length === 0 || order.length === 0) return null;

	// Build ordered visible list
	const visibleIds = order.filter((id) => !hiddenIds.includes(id));

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}>
			<SortableContext items={visibleIds} strategy={rectSortingStrategy}>
				<div className="not-content bento-grid-react">
					{visibleIds.map((id) => {
						const card = cards.find((c) => c.id === id);
						if (!card) return null;

						const { col, row } = getDims(
							id,
							units,
							card.defaultSize,
						);

						return (
							<SortableCard
								key={id}
								card={card}
								col={col}
								row={row}
								isDragging={activeId === id}
								slotRef={(el) => {
									if (el) slotRefs.current.set(id, el);
								}}
								onHide={() => hideCard(id)}
								onSetCol={(c) => handleSetCol(id, c)}
								onSetRow={(r) => handleSetRow(id, r)}
							/>
						);
					})}
				</div>
			</SortableContext>
		</DndContext>
	);
}
