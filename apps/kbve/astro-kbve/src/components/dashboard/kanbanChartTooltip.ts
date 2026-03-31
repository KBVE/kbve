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
		transform: 'translate(-50%, -100%) translateY(-12px)',
		pointerEvents: 'none',
		zIndex: '10',
		background: 'var(--sl-color-gray-6, #1a1a1a)',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		borderRadius: '6px',
		padding: '6px 10px',
		maxWidth: '280px',
		boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
		opacity: '0',
		visibility: 'hidden',
		transition: 'opacity 0.1s ease',
		top: '0',
		left: '0',
		whiteSpace: 'nowrap',
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
	container.appendChild(el);

	let currentId = '';

	return {
		el,
		show(label: string, value: string, e: MouseEvent) {
			labelEl.textContent = label;
			valueEl.textContent = value;
			const rect = container.getBoundingClientRect();
			el.style.left = `${e.clientX - rect.left}px`;
			el.style.top = `${e.clientY - rect.top}px`;
			el.style.opacity = '1';
			el.style.visibility = 'visible';
			currentId = `${chartId}-${label}`;
			openTooltip(currentId);
		},
		move(e: MouseEvent) {
			const rect = container.getBoundingClientRect();
			el.style.left = `${e.clientX - rect.left}px`;
			el.style.top = `${e.clientY - rect.top}px`;
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
