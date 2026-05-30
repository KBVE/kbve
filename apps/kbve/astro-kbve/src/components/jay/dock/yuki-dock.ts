/**
 * Vanilla driver for the Yuki dock — toggle, persist, and lazy-mount.
 *
 * The dock itself is server-rendered HTML (see `AstroYukiDock.astro`).
 * This file boots the runtime behavior:
 *
 *   1. Wires up the FAB + close button to toggle between
 *      `data-state="collapsed"` and `data-state="expanded"`.
 *   2. Persists the toggle state to `localStorage` so a hard reload
 *      restores whichever state the user left it in.
 *   3. Lazy-mounts the heavy React panel the FIRST time the dock is
 *      expanded. The dynamic `import()` resolves the React island's
 *      chunk only when the user actually opens the dock, so the
 *      initial bundle stays cold-load cheap.
 *
 * Idempotent: safe to call `initYukiDock()` multiple times. Under
 * ClientRouter we wrap the boot in `onMount` so it fires on initial
 * load + every nav swap; the `claimOnce`-style guard skips re-binding
 * when the persisted dock is still the same DOM node we already wired.
 */
import { onMount } from '@kbve/astro/utils/clientRouter';

const STORAGE_KEY = 'kbve:yuki-dock:state';
const BOUND_ATTR = 'data-kbve-yuki-bound';

type DockState = 'collapsed' | 'expanded';

function readStoredState(): DockState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw === 'expanded' ? 'expanded' : 'collapsed';
	} catch {
		return 'collapsed';
	}
}

function writeStoredState(state: DockState): void {
	try {
		localStorage.setItem(STORAGE_KEY, state);
	} catch {
		/* localStorage unavailable — silently ignore */
	}
}

function applyState(dock: HTMLElement, state: DockState): void {
	dock.dataset.state = state;
	const fab = dock.querySelector<HTMLButtonElement>('.kbve-yuki-dock__fab');
	const panel = dock.querySelector<HTMLElement>('.kbve-yuki-dock__panel');
	if (fab)
		fab.setAttribute(
			'aria-expanded',
			state === 'expanded' ? 'true' : 'false',
		);
	if (panel) {
		if (state === 'expanded') panel.removeAttribute('hidden');
		// Keep the panel mounted in the DOM even when collapsed so
		// `transition:persist` carries any lazy-mounted React tree
		// across nav. CSS handles the visual hide.
	}
}

let lazyPanelLoaded = false;
async function ensureLazyPanel(dock: HTMLElement): Promise<void> {
	if (lazyPanelLoaded) return;
	lazyPanelLoaded = true;
	const mount = dock.querySelector<HTMLElement>('[data-kbve-yuki-mount]');
	if (!mount) return;
	try {
		// Vite splits this into its own chunk; nothing about the dock
		// shell pulls it in until the user opens the dock.
		const mod = await import('./YukiPanel');
		await mod.mountYukiPanel(mount);
	} catch (err) {
		console.warn('[yuki-dock] lazy panel mount failed', err);
		mount.innerHTML =
			'<p class="kbve-yuki-dock__placeholder">Yuki failed to load. Refresh to try again.</p>';
	}
}

function bindDock(dock: HTMLElement): () => void {
	if (dock.getAttribute(BOUND_ATTR) === 'true') return () => {};
	dock.setAttribute(BOUND_ATTR, 'true');

	const initial = readStoredState();
	applyState(dock, initial);
	if (initial === 'expanded') {
		void ensureLazyPanel(dock);
	}

	const toggles = dock.querySelectorAll<HTMLElement>(
		'[data-kbve-yuki-toggle]',
	);
	const onToggleClick = (ev: Event) => {
		ev.preventDefault();
		const current = (dock.dataset.state as DockState) ?? 'collapsed';
		const next: DockState =
			current === 'expanded' ? 'collapsed' : 'expanded';
		applyState(dock, next);
		writeStoredState(next);
		if (next === 'expanded') void ensureLazyPanel(dock);
	};
	for (const t of toggles) {
		t.addEventListener('click', onToggleClick);
	}

	const onKeyDown = (ev: KeyboardEvent) => {
		if (
			ev.key === 'Escape' &&
			(dock.dataset.state as DockState) === 'expanded'
		) {
			applyState(dock, 'collapsed');
			writeStoredState('collapsed');
		}
	};
	document.addEventListener('keydown', onKeyDown);

	return () => {
		for (const t of toggles) {
			t.removeEventListener('click', onToggleClick);
		}
		document.removeEventListener('keydown', onKeyDown);
		dock.removeAttribute(BOUND_ATTR);
	};
}

export function initYukiDock(): void {
	onMount(() => {
		const dock = document.getElementById('kbve-yuki-dock');
		if (!dock) return;
		// `transition:persist` keeps the dock's DOM identity across
		// ClientRouter swaps. The bind flag short-circuits when we're
		// already wired against this exact node so we don't double-bind
		// keyboard listeners on a swap that didn't actually replace the
		// dock element.
		return bindDock(dock);
	});
}
