import { atom } from 'nanostores';

export const $activeCategory = atom<string>('all');
export const $activeRegistry = atom<string>('all');

export const $facetLanguage = atom<string>('all');
export const $facetCategory = atom<string>('all');
export const $facetStatus = atom<string>('all');
export const $facetSearch = atom<string>('');

export function setCategory(key: string): void {
	$activeCategory.set(key);
}

export function setRegistry(key: string): void {
	$activeRegistry.set(key);
}

export function setFacet(group: string, value: string): void {
	if (group === 'language') $facetLanguage.set(value);
	else if (group === 'category') $facetCategory.set(value);
	else if (group === 'status') $facetStatus.set(value);
}

export function setSearch(value: string): void {
	$facetSearch.set(value);
}
