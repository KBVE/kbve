import type { Remote } from 'comlink';
import type { LocalStorageAPI } from './db-worker';

export interface InitWorkerOptions {
	version: string;
	i18nPath?: string;
	dataPath?: string;
	locale?: string;
	defaults?: Record<string, string>;
}

export async function initializeWorkerDatabase(
	worker: Remote<LocalStorageAPI>,
	{
		version,
		i18nPath,
		dataPath,
		locale = 'en',
		defaults = {
			welcome: 'Welcome to the app!',
		},
	}: InitWorkerOptions,
) {
	console.log('[init-worker] Initializing database...');

	try {
		if (i18nPath) {
			await worker.loadI18nFromJSON(i18nPath);
			console.log(`[init-worker] i18n loaded from ${i18nPath}`);
		}

		await worker.dbSet('locale', locale);

		for (const [key, value] of Object.entries(defaults)) {
			await worker.dbSet(key, value);
		}

		await worker.setVersion(version);

		if (dataPath) {
			void worker.loadServersFromJSON(dataPath);
		}

		console.log(`[init-worker] DB initialized to version ${version}`);
	} catch (err) {
		console.error('[init-worker] Initialization failed:', err);
	}
}
