import { restoreSavedState, toggleSidebar } from './sidebar-state';

function init() {
	// Restore saved states
	restoreSavedState('left');
	restoreSavedState('right');

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
