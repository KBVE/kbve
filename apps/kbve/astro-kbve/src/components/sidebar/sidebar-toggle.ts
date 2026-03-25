import {
	restoreSavedState,
	toggleSidebar,
	isCollapsed,
	applyState,
} from './sidebar-state';

function ensureBackdrop(): HTMLElement {
	let backdrop = document.getElementById('sl-sidebar-backdrop');
	if (!backdrop) {
		backdrop = document.createElement('div');
		backdrop.id = 'sl-sidebar-backdrop';
		backdrop.className = 'sl-sidebar-backdrop';
		document.body.appendChild(backdrop);

		backdrop.addEventListener('click', () => {
			if (!isCollapsed('left')) {
				applyState('left', true);
			}
			if (!isCollapsed('right')) {
				applyState('right', true);
			}
		});
	}
	return backdrop;
}

function init() {
	// Restore saved states
	restoreSavedState('left');
	restoreSavedState('right');

	// Create backdrop on <body> — outside any sidebar stacking context
	ensureBackdrop();

	// Left sidebar: bottom button
	const leftBtn = document.getElementById('sl-sidebar-collapse-btn');
	if (leftBtn) {
		leftBtn.addEventListener('click', () => toggleSidebar('left'));
	}

	// Left sidebar: top button(s)
	document
		.querySelectorAll<HTMLElement>('.sl-sidebar-collapse-btn--top')
		.forEach((btn) => {
			btn.addEventListener('click', () => toggleSidebar('left'));
		});

	// Right sidebar: button
	const rightBtn = document.getElementById('sl-right-sidebar-collapse-btn');
	if (rightBtn) {
		rightBtn.addEventListener('click', () => toggleSidebar('right'));
	}
}

// Run on initial load
init();

// Re-run after Astro client-side navigation (View Transitions)
document.addEventListener('astro:after-swap', init);
