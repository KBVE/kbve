import { atom } from 'nanostores';
import type { CardId, CardOption } from './cards';
import type { BuildId } from './config';
import type { ItemId, ItemInstance } from './items';

export const goldAtom = atom(0);
export const livesAtom = atom(0);
export const waveAtom = atom(0);
export const enemiesLeftAtom = atom(0);
export const supplyAtom = atom(0);
export const demandAtom = atom(0);
export const batteryChargeAtom = atom(0);
export const batteryCapacityAtom = atom(0);
export const freeTowersAtom = atom(0);
export const bountyMulAtom = atom(1);

export type TimerState = 'IN_PROGRESS' | 'NEXT_WAVE';
export const timerStateAtom = atom<TimerState>('NEXT_WAVE');
export const timerSecAtom = atom(0);
export const canSkipAtom = atom(false);

export const gameOverAtom = atom<{
	visible: boolean;
	win: boolean;
	wave: number;
	bestBefore: number;
	newRecord: boolean;
}>({ visible: false, win: false, wave: 0, bestBefore: 0, newRecord: false });

export const nextWavePreviewAtom = atom<{ count: number; bossCount: number }>({
	count: 0,
	bossCount: 0,
});

export const bestWaveAtom = atom(0);

const BEST_WAVE_KEY = 'td:bestWave';

export function loadBestWave(): number {
	if (typeof window === 'undefined') return 0;
	try {
		const raw = window.localStorage.getItem(BEST_WAVE_KEY);
		const n = raw ? parseInt(raw, 10) : 0;
		return Number.isFinite(n) && n > 0 ? n : 0;
	} catch {
		return 0;
	}
}

export function saveBestWave(value: number): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(BEST_WAVE_KEY, String(value));
	} catch {
		// ignore quota / disabled storage
	}
}

export const skipSignalAtom = atom(0);
export const restartSignalAtom = atom(0);
export const speedFactorAtom = atom(1);

export const selectedBuildAtom = atom<BuildId>('basic');

export const cardOptionsAtom = atom<CardOption[] | null>(null);
export const cardWaveAtom = atom(0);
export const cardPickSignalAtom = atom<{ id: CardId | null; n: number }>({
	id: null,
	n: 0,
});
export const cardSkipSignalAtom = atom(0);

export const inventoryAtom = atom<ItemInstance[]>([]);
export const inventoryOpenAtom = atom(false);
export const useItemSignalAtom = atom<{ id: ItemId | null; n: number }>({
	id: null,
	n: 0,
});

export function resetHudStore(): void {
	goldAtom.set(0);
	livesAtom.set(0);
	waveAtom.set(0);
	enemiesLeftAtom.set(0);
	supplyAtom.set(0);
	demandAtom.set(0);
	batteryChargeAtom.set(0);
	batteryCapacityAtom.set(0);
	freeTowersAtom.set(0);
	bountyMulAtom.set(1);
	timerStateAtom.set('NEXT_WAVE');
	timerSecAtom.set(0);
	canSkipAtom.set(false);
	gameOverAtom.set({
		visible: false,
		win: false,
		wave: 0,
		bestBefore: 0,
		newRecord: false,
	});
	nextWavePreviewAtom.set({ count: 0, bossCount: 0 });
	speedFactorAtom.set(1);
	cardOptionsAtom.set(null);
	cardWaveAtom.set(0);
	cardPickSignalAtom.set({ id: null, n: cardPickSignalAtom.get().n });
	selectedBuildAtom.set('basic');
	inventoryAtom.set([]);
	inventoryOpenAtom.set(false);
	useItemSignalAtom.set({ id: null, n: useItemSignalAtom.get().n });
}
