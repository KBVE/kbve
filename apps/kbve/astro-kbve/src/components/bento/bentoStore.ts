/**
 * Bento Dashboard State Store
 *
 * Manages layout positions, hidden cards, and edit mode for the
 * customizable bento grid. Persists to localStorage per page.
 *
 * Follows patterns from sidebar-state.ts and clickhouseService.ts.
 */

import { atom } from 'nanostores';

// ── Types ──

export interface BentoLayoutItem {
	i: string; // bentoId
	x: number;
	y: number;
	w: number;
	h: number;
	minW?: number;
	minH?: number;
}

export interface BentoCardDef {
	bentoId: string;
	title: string;
	description?: string;
	bentoSize?: 'small' | 'medium' | 'large' | 'wide' | 'tall';
	bentoColor?: string;
	icon?: string;
}

interface PersistedState {
	layout: BentoLayoutItem[];
	hiddenIds: string[];
}

// ── Size → grid dimensions mapping (4-column grid) ──

const SIZE_MAP: Record<
	string,
	{ w: number; h: number; minW: number; minH: number }
> = {
	small: { w: 1, h: 1, minW: 1, minH: 1 },
	medium: { w: 2, h: 2, minW: 1, minH: 1 },
	large: { w: 2, h: 3, minW: 2, minH: 2 },
	wide: { w: 3, h: 1, minW: 2, minH: 1 },
	tall: { w: 1, h: 3, minW: 1, minH: 2 },
};

// ── Atoms ──

export const $bentoLayout = atom<BentoLayoutItem[]>([]);
export const $hiddenCardIds = atom<string[]>([]);
export const $editMode = atom<boolean>(false);

// ── Internal state ──

let _pageKey = '';
let _allCards: BentoCardDef[] = [];
let _defaultLayout: BentoLayoutItem[] = [];

// ── localStorage helpers ──

function storageKey(pageKey: string): string {
	return `bento-layout:${pageKey}`;
}

function loadState(pageKey: string): PersistedState | null {
	try {
		const raw = localStorage.getItem(storageKey(pageKey));
		if (!raw) return null;
		return JSON.parse(raw) as PersistedState;
	} catch {
		return null;
	}
}

function saveState(pageKey: string, state: PersistedState): void {
	try {
		localStorage.setItem(storageKey(pageKey), JSON.stringify(state));
	} catch {
		/* quota exceeded — ignore */
	}
}

// ── Default layout computation ──

function computeDefaultLayout(cards: BentoCardDef[]): BentoLayoutItem[] {
	return cards.map((card) => {
		const dims = SIZE_MAP[card.bentoSize || 'medium'] || SIZE_MAP.medium;
		return {
			i: card.bentoId,
			x: 0,
			y: Infinity, // react-grid-layout compacts this
			w: dims.w,
			h: dims.h,
			minW: dims.minW,
			minH: dims.minH,
		};
	});
}

// ── Public API ──

export function initBentoLayout(
	pageKey: string,
	cards: BentoCardDef[],
	precomputedLayout?: BentoLayoutItem[],
): void {
	_pageKey = pageKey;
	_allCards = cards;
	_defaultLayout = precomputedLayout || computeDefaultLayout(cards);

	const saved = loadState(pageKey);
	if (saved && saved.layout.length > 0) {
		// Merge saved layout with card defs (handle new/removed cards)
		const savedIds = new Set(saved.layout.map((l) => l.i));
		const cardIds = new Set(cards.map((c) => c.bentoId));

		// Keep saved items that still exist
		const validLayout = saved.layout.filter((l) => cardIds.has(l.i));
		const validHidden = saved.hiddenIds.filter((id) => cardIds.has(id));

		// Add new cards not in saved state
		const allKnownIds = new Set([...savedIds, ...saved.hiddenIds]);
		for (const card of cards) {
			if (!allKnownIds.has(card.bentoId)) {
				const dims =
					SIZE_MAP[card.bentoSize || 'medium'] || SIZE_MAP.medium;
				validLayout.push({
					i: card.bentoId,
					x: 0,
					y: Infinity,
					w: dims.w,
					h: dims.h,
					minW: dims.minW,
					minH: dims.minH,
				});
			}
		}

		$bentoLayout.set(validLayout);
		$hiddenCardIds.set(validHidden);
	} else {
		$bentoLayout.set(_defaultLayout);
		$hiddenCardIds.set([]);
	}
}

export function persistLayout(): void {
	if (!_pageKey) return;
	saveState(_pageKey, {
		layout: $bentoLayout.get(),
		hiddenIds: $hiddenCardIds.get(),
	});
}

export function updateLayout(newLayout: BentoLayoutItem[]): void {
	$bentoLayout.set(newLayout);
	persistLayout();
}

export function hideCard(id: string): void {
	$bentoLayout.set($bentoLayout.get().filter((l) => l.i !== id));
	$hiddenCardIds.set([...$hiddenCardIds.get(), id]);
	persistLayout();
}

export function showCard(id: string): void {
	const card = _allCards.find((c) => c.bentoId === id);
	const dims = SIZE_MAP[card?.bentoSize || 'medium'] || SIZE_MAP.medium;

	$hiddenCardIds.set($hiddenCardIds.get().filter((hid) => hid !== id));
	$bentoLayout.set([
		...$bentoLayout.get(),
		{
			i: id,
			x: 0,
			y: Infinity,
			w: dims.w,
			h: dims.h,
			minW: dims.minW,
			minH: dims.minH,
		},
	]);
	persistLayout();
}

export function resetLayout(): void {
	if (!_pageKey) return;
	localStorage.removeItem(storageKey(_pageKey));
	$bentoLayout.set(_defaultLayout);
	$hiddenCardIds.set([]);
	$editMode.set(false);
}

export function toggleEditMode(): void {
	$editMode.set(!$editMode.get());
}
