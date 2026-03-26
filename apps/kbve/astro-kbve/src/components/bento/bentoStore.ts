/**
 * Bento Grid State Store
 *
 * Single source of truth for card visibility and sizes.
 * Uses nanostores for reactive state shared across React islands.
 * Persists to localStorage per page key.
 */

import { atom, computed } from 'nanostores';

// ── Types ──

export interface CardUnits {
	col: number; // 1–4 grid columns
	row: number; // 1–3 grid rows
}

interface BentoState {
	hiddenIds: string[];
	units: Record<string, CardUnits>;
}

// ── Atoms ──

export const $pageKey = atom<string>('');
export const $hiddenIds = atom<string[]>([]);
export const $units = atom<Record<string, CardUnits>>({});

// ── Derived ──

export const $hiddenCount = computed($hiddenIds, (ids) => ids.length);

// ── localStorage helpers ──

function hiddenKey(pk: string) {
	return `bento-hidden:${pk}`;
}
function unitsKey(pk: string) {
	return `bento-units:${pk}`;
}

function loadHidden(pk: string): string[] {
	try {
		return JSON.parse(localStorage.getItem(hiddenKey(pk)) || '[]');
	} catch {
		return [];
	}
}

function loadUnits(pk: string): Record<string, CardUnits> {
	try {
		return JSON.parse(localStorage.getItem(unitsKey(pk)) || '{}');
	} catch {
		return {};
	}
}

function saveHidden(pk: string, ids: string[]) {
	try {
		localStorage.setItem(hiddenKey(pk), JSON.stringify(ids));
	} catch {
		/* quota */
	}
}

function saveUnits(pk: string, u: Record<string, CardUnits>) {
	try {
		localStorage.setItem(unitsKey(pk), JSON.stringify(u));
	} catch {
		/* quota */
	}
}

// ── Init ──

export function initBentoStore(pageKey: string): void {
	$pageKey.set(pageKey);
	$hiddenIds.set(loadHidden(pageKey));
	$units.set(loadUnits(pageKey));
}

// ── Actions ──

export function hideCard(id: string): void {
	const pk = $pageKey.get();
	const next = [...$hiddenIds.get(), id];
	$hiddenIds.set(next);
	saveHidden(pk, next);
}

export function showCard(id: string): void {
	const pk = $pageKey.get();
	const next = $hiddenIds.get().filter((x) => x !== id);
	$hiddenIds.set(next);
	saveHidden(pk, next);
}

/**
 * Read the card's current grid dimensions from the DOM.
 * Falls back to the CSS class defaults if no inline style is set.
 */
function getCurrentDims(id: string): { col: number; row: number } {
	const saved = $units.get()[id];
	if (saved) return saved;

	// Read from DOM — the CSS class or inline style determines actual size
	const el = document.getElementById(`bento-${id}`);
	if (el) {
		const cs = getComputedStyle(el);
		const col =
			parseInt(cs.gridColumnEnd, 10) - parseInt(cs.gridColumnStart, 10);
		const row = parseInt(cs.gridRowEnd, 10) - parseInt(cs.gridRowStart, 10);
		if (col > 0 && row > 0) return { col, row };
	}

	// Final fallback: read data-bento-default-size
	const sizeMap: Record<string, { col: number; row: number }> = {
		small: { col: 1, row: 1 },
		medium: { col: 2, row: 2 },
		large: { col: 2, row: 3 },
		wide: { col: 3, row: 1 },
		tall: { col: 1, row: 3 },
	};
	const defSize = el?.dataset.bentoDefaultSize || 'medium';
	return sizeMap[defSize] || { col: 2, row: 2 };
}

export function setCardCol(id: string, col: number): void {
	const pk = $pageKey.get();
	const prev = $units.get();
	const current = getCurrentDims(id);
	const next = { ...prev, [id]: { col, row: current.row } };
	$units.set(next);
	saveUnits(pk, next);
}

export function setCardRow(id: string, row: number): void {
	const pk = $pageKey.get();
	const prev = $units.get();
	const current = getCurrentDims(id);
	const next = { ...prev, [id]: { col: current.col, row } };
	$units.set(next);
	saveUnits(pk, next);
}

export function resetAll(): void {
	const pk = $pageKey.get();
	if (!pk) return;
	localStorage.removeItem(hiddenKey(pk));
	localStorage.removeItem(unitsKey(pk));
	$hiddenIds.set([]);
	$units.set({});
}
