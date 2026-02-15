import { atom } from 'nanostores';

export const $currentPath = atom('/');

let _routerBooted = false;

export function bootRouter(initial?: string): void {
	if (_routerBooted) return;
	_routerBooted = true;

	if (initial) $currentPath.set(initial);

	if (typeof window === 'undefined') return;

	$currentPath.set(window.location.pathname);

	document.addEventListener('astro:page-load', () => {
		$currentPath.set(window.location.pathname);
	});

	window.addEventListener('popstate', () => {
		$currentPath.set(window.location.pathname);
	});
}
