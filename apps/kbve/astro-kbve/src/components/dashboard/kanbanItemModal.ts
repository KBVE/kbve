import gsap from 'gsap';
import { openModal, closeModal } from '@kbve/droid';

/**
 * Persistent GSAP-animated modal for kanban item details.
 * Single DOM element created once, content swapped on each open.
 */

export interface KanbanItemInfo {
	type: 'ISSUE' | 'PULL_REQUEST';
	number: number;
	title: string;
	state: string;
	url: string;
	assignees: string[];
	labels: string[];
	date: string;
	column?: string;
}

export interface KanbanListInfo {
	title: string;
	subtitle: string;
	accentColor: string;
	items: KanbanItemInfo[];
}

let modal: HTMLDivElement | null = null;
let backdrop: HTMLDivElement | null = null;
let isOpen = false;

function labelColor(label: string): string {
	let hash = 0;
	for (let i = 0; i < label.length; i++) {
		hash = label.charCodeAt(i) + ((hash << 5) - hash);
	}
	return `hsl(${Math.abs(hash) % 360}, 55%, 55%)`;
}

function ensureModal(): { modal: HTMLDivElement; backdrop: HTMLDivElement } {
	if (modal && backdrop) return { modal, backdrop };

	// Backdrop
	backdrop = document.createElement('div');
	Object.assign(backdrop.style, {
		position: 'fixed',
		inset: '0',
		zIndex: '200',
		background: 'rgba(0, 0, 0, 0.6)',
		opacity: '0',
		visibility: 'hidden',
		cursor: 'pointer',
	});
	backdrop.addEventListener('click', hideItemModal);

	// Modal
	modal = document.createElement('div');
	modal.setAttribute('role', 'dialog');
	modal.setAttribute('aria-modal', 'true');
	Object.assign(modal.style, {
		position: 'fixed',
		top: '50%',
		left: '50%',
		transform: 'translate(-50%, -50%) scale(0.9)',
		zIndex: '201',
		width: '90%',
		maxWidth: '480px',
		background: 'var(--sl-color-bg-nav, #111)',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		borderRadius: '14px',
		padding: '0',
		boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
		opacity: '0',
		visibility: 'hidden',
		overflow: 'hidden',
	});

	// Inner HTML structure
	modal.innerHTML = `
		<div data-km-accent style="height:3px;border-radius:14px 14px 0 0"></div>
		<div style="padding:1.25rem 1.5rem">
			<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
				<div style="display:flex;align-items:center;gap:8px">
					<span data-km-type-icon style="display:flex"></span>
					<span data-km-number style="font-size:0.8rem;font-weight:600;color:var(--sl-color-gray-3,#8b949e)"></span>
					<span data-km-type-badge style="font-size:0.6rem;padding:2px 8px;border-radius:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em"></span>
				</div>
				<button data-km-close style="background:none;border:none;color:var(--sl-color-gray-3,#8b949e);cursor:pointer;font-size:1.2rem;line-height:1;padding:4px">✕</button>
			</div>
			<h3 data-km-title style="margin:0 0 0.75rem;font-size:1rem;font-weight:700;color:var(--sl-color-text,#e6edf3);line-height:1.4"></h3>
			<div style="display:flex;flex-direction:column;gap:0.5rem">
				<div style="display:flex;align-items:center;gap:6px;font-size:0.75rem;color:var(--sl-color-gray-3,#8b949e)">
					<span style="font-weight:500">State:</span>
					<span data-km-state style="font-weight:600"></span>
				</div>
				<div data-km-column-row style="display:flex;align-items:center;gap:6px;font-size:0.75rem;color:var(--sl-color-gray-3,#8b949e)">
					<span style="font-weight:500">Column:</span>
					<span data-km-column style="font-weight:600"></span>
				</div>
				<div style="display:flex;align-items:center;gap:6px;font-size:0.75rem;color:var(--sl-color-gray-3,#8b949e)">
					<span style="font-weight:500">Date:</span>
					<span data-km-date style="font-weight:600"></span>
				</div>
				<div data-km-assignees-row style="display:flex;align-items:center;gap:6px;font-size:0.75rem;color:var(--sl-color-gray-3,#8b949e)">
					<span style="font-weight:500">Assignees:</span>
					<span data-km-assignees style="font-weight:600"></span>
				</div>
				<div data-km-labels-row style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px"></div>
			</div>
			<a data-km-link href="#" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;margin-top:1rem;padding:8px 16px;border-radius:8px;background:var(--sl-color-accent,#06b6d4);color:#fff;text-decoration:none;font-size:0.8rem;font-weight:600;transition:opacity 0.15s">
				View on GitHub ↗
			</a>
		</div>
		<div data-km-list-view style="display:none">
			<div style="padding:1.25rem 1.5rem">
				<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
					<div>
						<h3 data-km-list-title style="margin:0;font-size:1rem;font-weight:700;color:var(--sl-color-text,#e6edf3)"></h3>
						<p data-km-list-subtitle style="margin:4px 0 0;font-size:0.75rem;color:var(--sl-color-gray-3,#8b949e)"></p>
					</div>
					<button data-km-list-close style="background:none;border:none;color:var(--sl-color-gray-3,#8b949e);cursor:pointer;font-size:1.2rem;line-height:1;padding:4px">✕</button>
				</div>
			</div>
			<div data-km-list-items style="max-height:50vh;overflow-y:auto;border-top:1px solid var(--sl-color-gray-5,#262626)"></div>
		</div>
	`;

	// Close buttons (single item + list views)
	const closeBtn = modal.querySelector('[data-km-close]');
	if (closeBtn) closeBtn.addEventListener('click', hideItemModal);
	const listCloseBtn = modal.querySelector('[data-km-list-close]');
	if (listCloseBtn) listCloseBtn.addEventListener('click', hideItemModal);

	// ESC key
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && isOpen) hideItemModal();
	});

	document.body.appendChild(backdrop);
	document.body.appendChild(modal);

	return { modal, backdrop };
}

function setSingleView(m: HTMLDivElement) {
	const singleView = m.children[1] as HTMLElement; // padding div with single item content
	const listView = m.querySelector<HTMLElement>('[data-km-list-view]');
	if (singleView) singleView.style.display = 'block';
	if (listView) listView.style.display = 'none';
}

function setListView(m: HTMLDivElement) {
	const singleView = m.children[1] as HTMLElement;
	const listView = m.querySelector<HTMLElement>('[data-km-list-view]');
	if (singleView) singleView.style.display = 'none';
	if (listView) listView.style.display = 'block';
}

export function showItemModal(item: KanbanItemInfo) {
	const { modal: m, backdrop: b } = ensureModal();
	setSingleView(m);

	const isIssue = item.type === 'ISSUE';

	// Update content
	const accent = m.querySelector<HTMLElement>('[data-km-accent]');
	if (accent) accent.style.background = isIssue ? '#22c55e' : '#8b5cf6';

	const typeIcon = m.querySelector<HTMLElement>('[data-km-type-icon]');
	if (typeIcon) {
		typeIcon.innerHTML = isIssue
			? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/></svg>'
			: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>';
	}

	const numEl = m.querySelector<HTMLElement>('[data-km-number]');
	if (numEl) numEl.textContent = `#${item.number}`;

	const typeBadge = m.querySelector<HTMLElement>('[data-km-type-badge]');
	if (typeBadge) {
		typeBadge.textContent = isIssue ? 'Issue' : 'PR';
		typeBadge.style.background = isIssue
			? 'rgba(34,197,94,0.15)'
			: 'rgba(139,92,246,0.15)';
		typeBadge.style.color = isIssue ? '#22c55e' : '#8b5cf6';
	}

	const titleEl = m.querySelector<HTMLElement>('[data-km-title]');
	if (titleEl) titleEl.textContent = item.title;

	const stateEl = m.querySelector<HTMLElement>('[data-km-state]');
	if (stateEl) {
		stateEl.textContent = item.state;
		stateEl.style.color =
			item.state === 'OPEN'
				? '#22c55e'
				: item.state === 'MERGED'
					? '#8b5cf6'
					: '#ef4444';
	}

	const colRow = m.querySelector<HTMLElement>('[data-km-column-row]');
	const colEl = m.querySelector<HTMLElement>('[data-km-column]');
	if (colRow && colEl) {
		if (item.column) {
			colRow.style.display = 'flex';
			colEl.textContent = item.column;
		} else {
			colRow.style.display = 'none';
		}
	}

	const dateEl = m.querySelector<HTMLElement>('[data-km-date]');
	if (dateEl) dateEl.textContent = item.date || 'Unknown';

	const assigneesRow = m.querySelector<HTMLElement>(
		'[data-km-assignees-row]',
	);
	const assigneesEl = m.querySelector<HTMLElement>('[data-km-assignees]');
	if (assigneesRow && assigneesEl) {
		if (item.assignees.length > 0) {
			assigneesRow.style.display = 'flex';
			assigneesEl.textContent = item.assignees.join(', ');
		} else {
			assigneesRow.style.display = 'none';
		}
	}

	const labelsRow = m.querySelector<HTMLElement>('[data-km-labels-row]');
	if (labelsRow) {
		labelsRow.innerHTML = '';
		if (item.labels.length > 0) {
			labelsRow.style.display = 'flex';
			for (const label of item.labels) {
				const pill = document.createElement('span');
				const color = labelColor(label);
				Object.assign(pill.style, {
					fontSize: '0.65rem',
					padding: '2px 8px',
					borderRadius: '10px',
					border: `1px solid ${color}`,
					color,
					lineHeight: '1.5',
				});
				pill.textContent = label;
				labelsRow.appendChild(pill);
			}
		} else {
			labelsRow.style.display = 'none';
		}
	}

	const linkEl = m.querySelector<HTMLAnchorElement>('[data-km-link]');
	if (linkEl) linkEl.href = item.url;

	// Animate in
	isOpen = true;
	openModal(`kb-item-${item.number}`);

	gsap.set(b, { visibility: 'visible' });
	gsap.to(b, { opacity: 1, duration: 0.25, ease: 'power2.out' });

	gsap.set(m, { visibility: 'visible', scale: 0.9, opacity: 0, y: 20 });
	gsap.to(m, {
		opacity: 1,
		scale: 1,
		y: 0,
		duration: 0.35,
		ease: 'back.out(1.5)',
	});
}

/**
 * Show the modal in list mode — for aggregate data points (heatmap cells, donut slices, etc.)
 */
export function showListModal(info: KanbanListInfo) {
	const { modal: m, backdrop: b } = ensureModal();
	setListView(m);

	const accent = m.querySelector<HTMLElement>('[data-km-accent]');
	if (accent) accent.style.background = info.accentColor;

	const titleEl = m.querySelector<HTMLElement>('[data-km-list-title]');
	if (titleEl) titleEl.textContent = info.title;

	const subtitleEl = m.querySelector<HTMLElement>('[data-km-list-subtitle]');
	if (subtitleEl) subtitleEl.textContent = info.subtitle;

	const listContainer = m.querySelector<HTMLElement>('[data-km-list-items]');
	if (listContainer) {
		listContainer.innerHTML = '';
		for (const item of info.items.slice(0, 50)) {
			const isIssue = item.type === 'ISSUE';
			const row = document.createElement('a');
			row.href = item.url;
			row.target = '_blank';
			row.rel = 'noopener noreferrer';
			Object.assign(row.style, {
				display: 'flex',
				alignItems: 'center',
				gap: '0.6rem',
				padding: '8px 1.5rem',
				borderBottom: '1px solid var(--sl-color-gray-5, #262626)',
				textDecoration: 'none',
				color: 'var(--sl-color-text, #e6edf3)',
				fontSize: '0.8rem',
				transition: 'background 0.1s',
				cursor: 'pointer',
			});
			row.addEventListener('mouseenter', () => {
				row.style.background = 'rgba(255,255,255,0.03)';
			});
			row.addEventListener('mouseleave', () => {
				row.style.background = 'transparent';
			});

			// Type dot
			const dot = document.createElement('span');
			dot.style.cssText = `width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${isIssue ? '#22c55e' : '#8b5cf6'}`;
			row.appendChild(dot);

			// Number
			const num = document.createElement('span');
			num.style.cssText =
				'font-size:0.75rem;font-weight:600;color:var(--sl-color-gray-3,#8b949e);min-width:40px;flex-shrink:0';
			num.textContent = `#${item.number}`;
			row.appendChild(num);

			// Title
			const title = document.createElement('span');
			title.style.cssText =
				'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0';
			title.textContent = item.title;
			row.appendChild(title);

			// Date
			if (item.date) {
				const date = document.createElement('span');
				date.style.cssText =
					'font-size:0.7rem;color:var(--sl-color-gray-4,#6b7280);flex-shrink:0';
				date.textContent = item.date;
				row.appendChild(date);
			}

			listContainer.appendChild(row);
		}
		if (info.items.length > 50) {
			const more = document.createElement('div');
			more.style.cssText =
				'padding:8px 1.5rem;text-align:center;font-size:0.7rem;color:var(--sl-color-gray-4,#6b7280)';
			more.textContent = `+${info.items.length - 50} more items`;
			listContainer.appendChild(more);
		}
	}

	// Animate in
	isOpen = true;
	openModal('kb-list-modal');

	gsap.set(b, { visibility: 'visible' });
	gsap.to(b, { opacity: 1, duration: 0.25, ease: 'power2.out' });

	gsap.set(m, { visibility: 'visible', scale: 0.9, opacity: 0, y: 20 });
	gsap.to(m, {
		opacity: 1,
		scale: 1,
		y: 0,
		duration: 0.35,
		ease: 'back.out(1.5)',
	});
}

export function hideItemModal() {
	if (!modal || !backdrop || !isOpen) return;
	isOpen = false;

	gsap.to(modal, {
		opacity: 0,
		scale: 0.9,
		y: 20,
		duration: 0.2,
		ease: 'power2.in',
		onComplete: () => {
			if (modal) modal.style.visibility = 'hidden';
			closeModal('kb-item-modal');
		},
	});
	gsap.to(backdrop, {
		opacity: 0,
		duration: 0.2,
		ease: 'power2.in',
		onComplete: () => {
			if (backdrop) backdrop.style.visibility = 'hidden';
		},
	});
}
