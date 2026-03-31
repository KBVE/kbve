import { openTooltip, closeTooltip } from '@kbve/droid';
import {
	showItemModal,
	showListModal,
	type KanbanItemInfo,
	type KanbanListInfo,
} from './kanbanItemModal';

/**
 * Shared persistent tooltip for D3 kanban charts.
 * Creates a single tooltip DOM element and provides show/move/hide functions.
 * Uses droid event system for global tooltip state tracking.
 */
export interface ChartTooltip {
	el: HTMLDivElement;
	show: (label: string, value: string, e: MouseEvent) => void;
	move: (e: MouseEvent) => void;
	hide: () => void;
}

export function createChartTooltip(
	container: HTMLElement,
	chartId: string,
): ChartTooltip {
	const el = document.createElement('div');
	el.setAttribute('role', 'tooltip');
	el.setAttribute('aria-hidden', 'true');
	Object.assign(el.style, {
		position: 'absolute',
		pointerEvents: 'none',
		zIndex: '10',
		background: 'var(--sl-color-gray-6, #1a1a1a)',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		borderRadius: '6px',
		padding: '6px 10px',
		maxWidth: '340px',
		minWidth: '120px',
		width: 'max-content',
		boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
		opacity: '0',
		visibility: 'hidden',
		transition: 'opacity 0.1s ease',
		top: '0',
		left: '0',
		whiteSpace: 'normal',
		wordBreak: 'break-word',
	});

	const labelEl = document.createElement('div');
	Object.assign(labelEl.style, {
		fontSize: '0.8rem',
		fontWeight: '600',
		color: 'var(--sl-color-white, #e6edf3)',
		lineHeight: '1.3',
	});
	el.appendChild(labelEl);

	const valueEl = document.createElement('div');
	Object.assign(valueEl.style, {
		fontSize: '0.7rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
		lineHeight: '1.3',
	});
	el.appendChild(valueEl);

	container.style.position = 'relative';
	container.style.overflow = 'visible';
	container.appendChild(el);

	let currentId = '';

	/**
	 * Position the tooltip near the cursor, clamped to stay within the viewport.
	 * Uses fixed positioning relative to the viewport for reliable clamping,
	 * then converts back to container-relative coords.
	 */
	function positionTooltip(e: MouseEvent) {
		// First, place it at cursor in container coords so we can measure
		const containerRect = container.getBoundingClientRect();
		const cursorContainerX = e.clientX - containerRect.left;
		const cursorContainerY = e.clientY - containerRect.top;

		// Temporarily make visible at cursor to measure size
		el.style.left = `${cursorContainerX}px`;
		el.style.top = `${cursorContainerY}px`;
		el.style.transform = 'translate(-50%, -100%) translateY(-12px)';

		const tipRect = el.getBoundingClientRect();
		const pad = 8;

		// Clamp horizontally: ensure tooltip stays within viewport
		let finalLeft = e.clientX - tipRect.width / 2;
		if (finalLeft < pad) {
			finalLeft = pad;
		} else if (finalLeft + tipRect.width > window.innerWidth - pad) {
			finalLeft = window.innerWidth - pad - tipRect.width;
		}

		// Clamp vertically: if tooltip would go above viewport, show below cursor instead
		let finalTop = e.clientY - tipRect.height - 12;
		let flipBelow = false;
		if (finalTop < pad) {
			finalTop = e.clientY + 16;
			flipBelow = true;
		}

		// Convert back to container-relative
		el.style.left = `${finalLeft - containerRect.left}px`;
		el.style.top = `${finalTop - containerRect.top}px`;
		el.style.transform = flipBelow ? 'none' : 'none';
	}

	return {
		el,
		show(label: string, value: string, e: MouseEvent) {
			labelEl.textContent = label;
			valueEl.textContent = value;
			el.style.opacity = '1';
			el.style.visibility = 'visible';
			positionTooltip(e);
			currentId = `${chartId}-${label}`;
			openTooltip(currentId);
		},
		move(e: MouseEvent) {
			positionTooltip(e);
		},
		hide() {
			el.style.opacity = '0';
			el.style.visibility = 'hidden';
			if (currentId) {
				closeTooltip(currentId);
				currentId = '';
			}
		},
	};
}

/**
 * Attach tooltip events to an SVG element.
 */
export function attachTooltipEvents(
	svgEl: SVGElement,
	tooltip: ChartTooltip,
	label: string,
	value: string,
) {
	svgEl.style.cursor = 'pointer';
	svgEl.addEventListener('mouseenter', (e) => tooltip.show(label, value, e));
	svgEl.addEventListener('mousemove', (e) => tooltip.move(e));
	svgEl.addEventListener('mouseleave', () => tooltip.hide());
}

/**
 * Attach tooltip + click-to-modal for an SVG element representing a kanban item.
 */
export function attachItemEvents(
	svgEl: SVGElement,
	tooltip: ChartTooltip,
	label: string,
	value: string,
	itemInfo: KanbanItemInfo,
) {
	attachTooltipEvents(svgEl, tooltip, label, value);
	svgEl.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		tooltip.hide();
		showItemModal(itemInfo);
	});
}

/**
 * Attach tooltip + click-to-list-modal for aggregate data points (column slices, date cells, etc.)
 */
export function attachListEvents(
	svgEl: SVGElement,
	tooltip: ChartTooltip,
	label: string,
	value: string,
	listInfo: KanbanListInfo,
) {
	attachTooltipEvents(svgEl, tooltip, label, value);
	svgEl.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		tooltip.hide();
		showListModal(listInfo);
	});
}

export type { KanbanItemInfo, KanbanListInfo };
