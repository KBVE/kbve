/**
 * Run cleanup on Astro ClientRouter swap (and pagehide for full reloads).
 *
 * ClientRouter turns the site into an SPA — `<script>` blocks run once on
 * first load, never on subsequent navigations. Any global listener,
 * interval, or observer that isn't torn down on `astro:before-swap` will
 * leak across navigations and cause duplicate-handler bugs.
 *
 * Usage inside an Astro `<script>`:
 *
 *   import { onSwap } from '@kbve/astro/utils/clientRouter';
 *   const obs = new IntersectionObserver(...);
 *   onSwap(() => obs.disconnect());
 */
export const onSwap = (cleanup: () => void): void => {
	const fire = () => {
		try {
			cleanup();
		} catch {}
	};
	document.addEventListener('astro:before-swap', fire, { once: true });
	window.addEventListener('pagehide', fire, { once: true });
};

/**
 * Re-run an init function on every ClientRouter swap (initial load + each
 * navigation). The returned cleanup is wired to the matching swap so that
 * stateful resources (observers, listeners, intervals) are torn down right
 * before the new page mounts.
 *
 * Usage:
 *
 *   onMount(() => {
 *     const id = setInterval(tick, 1000);
 *     return () => clearInterval(id);
 *   });
 */
export const onMount = (init: () => (() => void) | void): void => {
	const run = () => {
		const cleanup = init();
		if (typeof cleanup === 'function') onSwap(cleanup);
	};
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', run, { once: true });
	} else {
		run();
	}
	document.addEventListener('astro:after-swap', run);
};

/**
 * Idempotent per-element init. Sets a data attribute on the element and
 * skips re-init while the attribute is present. Returns true when init
 * should run, false when the element was already initialized.
 */
export const claimOnce = (
	el: HTMLElement,
	flag: string = 'data-cr-init',
): boolean => {
	if (el.getAttribute(flag) === 'true') return false;
	el.setAttribute(flag, 'true');
	return true;
};
