import { DroidEvents } from '@kbve/droid';

const STORAGE_KEY = 'sl-right-sidebar-collapsed';
const ATTR = 'data-right-sidebar-collapsed';

function isCollapsed(): boolean {
	return document.documentElement.getAttribute(ATTR) === 'true';
}

function applyState(collapsed: boolean) {
	document.documentElement.setAttribute(ATTR, String(collapsed));
	localStorage.setItem(STORAGE_KEY, String(collapsed));
	DroidEvents.emit(collapsed ? 'panel-close' : 'panel-open', { id: 'right' });
}

function toggle() {
	applyState(!isCollapsed());
}

function restore() {
	const saved = localStorage.getItem(STORAGE_KEY);
	const collapsed = saved !== 'false';
	document.documentElement.setAttribute(ATTR, String(collapsed));
}

function init() {
	restore();
	const btn = document.getElementById('sl-right-sidebar-collapse-btn');
	btn?.addEventListener('click', toggle);
}

init();
document.addEventListener('astro:after-swap', init);
