/**
 * Lifecycle helpers for Astro pages — works under any of:
 *
 *   - Classic full-page navigation (DOMContentLoaded fires fresh each nav).
 *   - Native cross-document view transitions
 *     (`@view-transition { navigation: auto }` in CSS — `pagereveal` fires
 *     after the new doc is parsed but before paint).
 *   - Astro ClientRouter SPA (`astro:after-swap` / `astro:before-swap`).
 *   - Browser bfcache restore (back/forward where the document is reused
 *     without re-parsing — `pageshow` with `event.persisted === true`
 *     is the only signal).
 *
 * Use `onMount` to (re-)init state on every arrival; return a cleanup
 * function and it is automatically wired to teardown on page exit. Use
 * `onSwap` for cleanup-only registration.
 */

type Cleanup = () => void;
type PageSource = 'initial' | 'astro-swap' | 'page-reveal' | 'bfcache';

const safeRun = (fn: () => void): void => {
	try {
		fn();
	} catch {}
};

// Lazy import @kbve/droid so this module stays usable in environments
// where droid isn't loaded (tests, isolated component playgrounds).
type DroidEventBus = {
	emit: (
		event: 'page-mount' | 'page-swap' | 'page-hide',
		payload: { timestamp: number; url: string; source: PageSource },
	) => void;
};
let droidBus: DroidEventBus | null = null;
let droidBusLoaded = false;
const getBus = async (): Promise<DroidEventBus | null> => {
	if (droidBusLoaded) return droidBus;
	droidBusLoaded = true;
	try {
		const mod = await import('@kbve/droid');
		droidBus = (mod as any).DroidEvents ?? null;
	} catch {
		droidBus = null;
	}
	return droidBus;
};

const emitLifecycle = (
	event: 'page-mount' | 'page-swap' | 'page-hide',
	source: PageSource,
): void => {
	if (typeof window === 'undefined') return;
	const payload = {
		timestamp: Date.now(),
		url: window.location.href,
		source,
	};
	getBus().then((bus) => {
		if (bus) bus.emit(event, payload);
	});
	window.dispatchEvent(new CustomEvent(event, { detail: payload }));
};

/**
 * Register a cleanup that fires when the page is leaving — covers SPA
 * swaps (`astro:before-swap`) and full-doc unloads (`pagehide`). Listener
 * fires at most once per registration.
 */
export const onSwap = (cleanup: Cleanup): void => {
	let fired = false;
	const fire = () => {
		if (fired) return;
		fired = true;
		safeRun(cleanup);
	};
	document.addEventListener('astro:before-swap', fire, { once: true });
	window.addEventListener('pagehide', fire, { once: true });
};

let lifecycleHooked = false;
const hookLifecycleSignals = (): void => {
	if (lifecycleHooked || typeof window === 'undefined') return;
	lifecycleHooked = true;
	document.addEventListener('astro:before-swap', () =>
		emitLifecycle('page-hide', 'astro-swap'),
	);
	window.addEventListener('pagehide', () =>
		emitLifecycle('page-hide', 'initial'),
	);
};

/**
 * Run `init` once the document is ready, again on every arrival
 * (SPA swap, native VT page-reveal, or bfcache restore). The optional
 * cleanup returned from `init` is wired to the matching teardown so
 * that observers/intervals/listeners are torn down before the next
 * arrival.
 *
 * Usage:
 *
 *   onMount(() => {
 *     const id = setInterval(tick, 1000);
 *     return () => clearInterval(id);
 *   });
 */
export const onMount = (init: () => Cleanup | void): void => {
	hookLifecycleSignals();
	let runningCleanup: Cleanup | null = null;

	const run = (source: PageSource) => {
		// If a previous mount registered a cleanup but it never fired
		// (e.g. bfcache restore skipped pagehide on this tab), drop it
		// before running again so resources don't stack.
		if (runningCleanup) {
			safeRun(runningCleanup);
			runningCleanup = null;
		}
		emitLifecycle(
			source === 'initial' ? 'page-mount' : 'page-swap',
			source,
		);
		const cleanup = init();
		if (typeof cleanup === 'function') {
			runningCleanup = cleanup;
			onSwap(() => {
				runningCleanup = null;
				cleanup();
			});
		}
	};

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => run('initial'), {
			once: true,
		});
	} else {
		run('initial');
	}

	// Astro ClientRouter SPA navigations.
	document.addEventListener('astro:after-swap', () => run('astro-swap'));

	// Native cross-document view transition: fires after the new document
	// is parsed but before first paint. Some browsers also expose this
	// without view transitions — guard with a flag so we don't double-run
	// alongside DOMContentLoaded on the very first load.
	let firstReveal = true;
	document.addEventListener('pagereveal', () => {
		if (firstReveal) {
			firstReveal = false;
			return;
		}
		run('page-reveal');
	});

	// bfcache restore — back/forward where the document is reused.
	window.addEventListener('pageshow', (e: PageTransitionEvent) => {
		if (e.persisted) run('bfcache');
	});
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
