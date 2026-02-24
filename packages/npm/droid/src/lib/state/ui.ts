import { atom } from 'nanostores';
import { DroidEvents } from '../workers/events';

export const $activeTooltip = atom<string | null>(null);
export const $drawerOpen = atom(false);
export const $modalId = atom<string | null>(null);

export function openTooltip(id: string) {
	$activeTooltip.set(id);
	DroidEvents.emit('tooltip-opened', { id });
}

export function closeTooltip(id?: string) {
	if (id && $activeTooltip.get() !== id) return;
	const closedId = $activeTooltip.get();
	$activeTooltip.set(null);
	if (closedId) {
		DroidEvents.emit('tooltip-closed', { id: closedId });
	}
}

export function openDrawer() {
	$drawerOpen.set(true);
	$activeTooltip.set(null);
}

export function closeDrawer() {
	$drawerOpen.set(false);
}

export function openModal(id: string) {
	$modalId.set(id);
	$drawerOpen.set(false);
	$activeTooltip.set(null);
	DroidEvents.emit('modal-opened', { id });
}

export function closeModal(id?: string) {
	if (id && $modalId.get() !== id) return;
	const closedId = $modalId.get();
	$modalId.set(null);
	if (closedId) {
		DroidEvents.emit('modal-closed', { id: closedId });
	}
}
