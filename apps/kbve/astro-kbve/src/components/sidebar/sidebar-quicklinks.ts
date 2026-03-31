import { DroidEvents } from '@kbve/droid';

interface QuickLink {
	label: string;
	href: string;
}

let activePopover: HTMLElement | null = null;
let activeLabel: string | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

function isCollapsed(): boolean {
	return (
		document.documentElement.getAttribute('data-sidebar-collapsed') ===
		'true'
	);
}

function dismissPopover() {
	if (activePopover) {
		activePopover.remove();
		activePopover = null;
		if (activeLabel) {
			DroidEvents.emit('tooltip-closed', { id: activeLabel });
			activeLabel = null;
		}
	}
}

function clearHideTimeout() {
	if (hideTimeout) {
		clearTimeout(hideTimeout);
		hideTimeout = null;
	}
}

function scheduleHide() {
	clearHideTimeout();
	hideTimeout = setTimeout(dismissPopover, 150);
}

function showPopover(anchor: Element, links: QuickLink[], label: string) {
	if (activeLabel === label && activePopover) return;
	dismissPopover();

	const rect = anchor.getBoundingClientRect();

	const popover = document.createElement('div');
	popover.className = 'sl-icon-quicklinks';
	popover.setAttribute('role', 'menu');

	// Header
	const header = document.createElement('div');
	header.className = 'sl-icon-quicklinks-header';
	header.textContent = label;
	popover.appendChild(header);

	// Links
	for (const link of links) {
		const a = document.createElement('a');
		a.href = link.href;
		a.className = 'sl-icon-quicklinks-item';
		a.setAttribute('role', 'menuitem');
		a.setAttribute('data-astro-prefetch', '');
		a.textContent = link.label;
		popover.appendChild(a);
	}

	// Position: right of the icon, vertically centered
	popover.style.top = `${rect.top + rect.height / 2}px`;
	popover.style.left = `${rect.right + 8}px`;

	// Keep popover alive on hover
	popover.addEventListener('mouseenter', clearHideTimeout);
	popover.addEventListener('mouseleave', scheduleHide);

	document.body.appendChild(popover);

	// Clamp to viewport
	const popRect = popover.getBoundingClientRect();
	const transformY = -(popRect.height / 2);
	if (rect.top + rect.height / 2 + transformY < 4) {
		popover.style.top = `${4 + popRect.height / 2}px`;
	}
	if (popRect.bottom > window.innerHeight - 4) {
		popover.style.top = `${window.innerHeight - 4 - popRect.height / 2}px`;
	}

	activePopover = popover;
	activeLabel = label;
	DroidEvents.emit('tooltip-opened', { id: label });
}

function init() {
	const items = document.querySelectorAll<HTMLLIElement>(
		'.top-level > li[data-quicklinks]',
	);

	for (const li of items) {
		const raw = li.getAttribute('data-quicklinks');
		if (!raw) continue;

		let links: QuickLink[];
		try {
			links = JSON.parse(raw);
		} catch {
			continue;
		}

		// The clickable/hoverable target is the <summary> or <a> inside the <li>
		const trigger =
			li.querySelector<HTMLElement>('summary') ??
			li.querySelector<HTMLElement>(':scope > a');
		if (!trigger) continue;

		const label =
			li
				.querySelector('.sl-sidebar-group-text, .group-label .large')
				?.textContent?.trim() ?? 'Menu';

		trigger.addEventListener('mouseenter', () => {
			if (!isCollapsed()) return;
			clearHideTimeout();
			showPopover(trigger, links, label);
		});

		trigger.addEventListener('mouseleave', () => {
			if (!isCollapsed()) return;
			scheduleHide();
		});

		// On click when collapsed, show popover instead of toggling details
		trigger.addEventListener('click', (e) => {
			if (!isCollapsed()) return;
			// Prevent details toggle in collapsed mode
			if (trigger.tagName === 'SUMMARY') {
				e.preventDefault();
			}
			clearHideTimeout();
			if (activeLabel === label && activePopover) {
				dismissPopover();
			} else {
				showPopover(trigger, links, label);
			}
		});
	}

	// Dismiss on sidebar expand
	const observer = new MutationObserver(() => {
		if (!isCollapsed()) dismissPopover();
	});
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-sidebar-collapsed'],
	});

	// Dismiss on scroll
	const sidebarList = document.querySelector('.sl-sidebar-list-wrap');
	if (sidebarList) {
		sidebarList.addEventListener('scroll', dismissPopover);
	}
}

// Run on initial load and Astro page transitions
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
	init();
}
document.addEventListener('astro:page-load', init);
