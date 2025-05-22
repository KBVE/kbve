import { atom } from 'nanostores';
export const STAGES = ['read', 'map', 'home'] as const;
export type Stage = (typeof STAGES)[number];

export const $stage = atom<Stage>('read');

export function nextStage() {
	const current = $stage.get();
	const currentIndex = STAGES.indexOf(current);
	const next = STAGES[(currentIndex + 1) % STAGES.length];
	$stage.set(next);
}
