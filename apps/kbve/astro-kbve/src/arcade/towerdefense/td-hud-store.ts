import { atom } from 'nanostores';

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
}>({ visible: false, win: false, wave: 0 });

export const skipSignalAtom = atom(0);
export const restartSignalAtom = atom(0);

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
	gameOverAtom.set({ visible: false, win: false, wave: 0 });
}
