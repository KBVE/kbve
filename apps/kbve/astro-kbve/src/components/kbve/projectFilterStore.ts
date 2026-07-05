import { atom } from 'nanostores';

export const $activeCategory = atom<string>('all');
export const $activeRegistry = atom<string>('all');

export function setCategory(key: string): void {
	$activeCategory.set(key);
}

export function setRegistry(key: string): void {
	$activeRegistry.set(key);
}
