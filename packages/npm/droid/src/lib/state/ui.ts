import { atom } from 'nanostores';

export const $activeTooltip = atom<string | null>(null);
export const $drawerOpen = atom(false);
export const $modalId = atom<string | null>(null);

export function openTooltip(id: string) {
	$activeTooltip.set(id);
}

export function closeTooltip(id?: string) {
	if (id && $activeTooltip.get() !== id) return;
	$activeTooltip.set(null);
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
}

export function closeModal(id?: string) {
	if (id && $modalId.get() !== id) return;
	$modalId.set(null);
}
