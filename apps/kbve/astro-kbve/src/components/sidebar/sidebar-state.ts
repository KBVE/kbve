import { DroidEvents } from '@kbve/droid';

const LEFT_STORAGE_KEY = 'sl-sidebar-collapsed';
const RIGHT_STORAGE_KEY = 'sl-right-sidebar-collapsed';

type Side = 'left' | 'right';

function getAttr(side: Side): string {
	return side === 'left'
		? 'data-sidebar-collapsed'
		: 'data-right-sidebar-collapsed';
}

function getStorageKey(side: Side): string {
	return side === 'left' ? LEFT_STORAGE_KEY : RIGHT_STORAGE_KEY;
}

export function isCollapsed(side: Side): boolean {
	return document.documentElement.getAttribute(getAttr(side)) === 'true';
}

export function applyState(side: Side, collapsed: boolean) {
	document.documentElement.setAttribute(getAttr(side), String(collapsed));
	localStorage.setItem(getStorageKey(side), String(collapsed));
	DroidEvents.emit(collapsed ? 'panel-close' : 'panel-open', {
		id: side,
	});
}

export function toggleSidebar(side: Side) {
	applyState(side, !isCollapsed(side));
}

export function restoreSavedState(side: Side) {
	const saved = localStorage.getItem(getStorageKey(side));
	if (saved === 'true') {
		document.documentElement.setAttribute(getAttr(side), 'true');
	}
}
