import type { Remote } from 'comlink';
import type { LocalStorageAPI } from '../workers/db-worker';

const THEME_VARS = [
	'accent',
	'accent-low',
	'accent-high',
	'bg',
	'bg-accent',
	'text',
	'text-accent',
	'border',
	'white',
	'black',
] as const;

/**
 * Read resolved CSS custom property values from the document root
 * and persist them to Dexie so workers can access theme colors.
 */
export async function syncThemeToDexie(
	api: Remote<LocalStorageAPI>,
): Promise<void> {
	const root = document.documentElement;
	const styles = getComputedStyle(root);
	const mode = root.dataset['theme'] ?? 'dark';

	await api.dbSet('theme:mode', mode);

	for (const name of THEME_VARS) {
		const value = styles.getPropertyValue(`--sl-color-${name}`).trim();
		if (value) {
			await api.dbSet(`theme:${name}`, value);
		}
	}
}

/**
 * Broadcast a theme-sync event so workers re-read colors from Dexie.
 */
export function broadcastThemeChange(): void {
	try {
		const bc = new BroadcastChannel('kbve_theme');
		bc.postMessage({ type: 'theme-sync', timestamp: Date.now() });
		bc.close();
	} catch {
		// BroadcastChannel not available — workers won't get live updates
	}
}

/**
 * Observe theme attribute changes and auto-sync.
 * Call once from main() after Dexie is initialized.
 */
export function observeThemeChanges(api: Remote<LocalStorageAPI>): void {
	const observer = new MutationObserver(async (mutations) => {
		for (const mutation of mutations) {
			if (
				mutation.type === 'attributes' &&
				mutation.attributeName === 'data-theme'
			) {
				await syncThemeToDexie(api);
				broadcastThemeChange();
			}
		}
	});

	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-theme'],
	});

	// Initial sync
	void syncThemeToDexie(api);
}
