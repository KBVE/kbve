import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import { persistentMap } from '@nanostores/persistent';
import type { LocalStorageAPI } from './db-worker';
import { initializeWorkerDatabase, type InitWorkerOptions } from './init';

const EXPECTED_DB_VERSION = '1.0.1';

const i18nStore = persistentMap<Record<string, string>>(
	'i18n-cache',
	{},
	{
		encode: JSON.stringify,
		decode: JSON.parse,
	},
);

export const i18n = {
	store: i18nStore,
	api: null as Remote<LocalStorageAPI> | null,
	ready: Promise.resolve(),

	get(key: string): string {
		return i18nStore.get()[key] ?? `[${key}]`;
	},

	async getAsync(key: string): Promise<string> {
		const cached = i18nStore.get()[key];
		if (cached !== undefined) return cached;

		if (!this.api) return `[${key}]`;

		const value = await this.api.getTranslation(key);
		if (value !== null) {
			i18nStore.setKey(key, value);
			return value;
		}

		return `[${key}]`;
	},

	set(key: string, value: string) {
		i18nStore.setKey(key, value);
	},

	async hydrate(api: Remote<LocalStorageAPI>, keys: string[]) {
		this.api = api;
		for (const key of keys) {
			const value = await api.getTranslation(key);
			if (value !== null) {
				i18nStore.setKey(key, value);
			}
		}
	},

	async hydrateLocale(locale = 'en') {
		if (!this.api) return;

		const allKeys = await this.api.getAllI18nKeys();
		const localeKeys = allKeys.filter((key) =>
			key.startsWith(`${locale}:`),
		);
		const translations = await this.api.getTranslations(localeKeys);

		for (const [key, value] of Object.entries(translations)) {
			console.log(`[i18n.setKey] ${key} = ${value}`);
			this.store.setKey(key, value);
		}
	},
};

function initSWComlink() {
	if (!navigator.serviceWorker?.controller) return;
	const channel = new MessageChannel();
	navigator.serviceWorker.controller.postMessage(channel.port2, [
		channel.port2,
	]);
	channel.port1.start();
}

async function initStorageComlink(): Promise<Remote<LocalStorageAPI>> {
	const worker = new SharedWorker(new URL('./db-worker', import.meta.url), {
		type: 'module',
	});
	worker.port.start();
	const api = wrap<LocalStorageAPI>(worker.port);

	const version = await api.getVersion();
	if (version !== EXPECTED_DB_VERSION) {
		await initializeWorkerDatabase(api, {
			version: EXPECTED_DB_VERSION,
			i18nPath: '/i18n/db.json',
			locale: 'en',
			defaults: { welcome: 'Welcome!', theme: 'dark' },
		});
	}

	return api;
}

let initialized = false;

export async function main() {
	if (!initialized) {
		initialized = true;

		if (navigator.serviceWorker?.controller) {
			initSWComlink();
		} else {
			navigator.serviceWorker?.addEventListener('controllerchange', initSWComlink);
		}
	}

	if (!window.kbve?.api || !window.kbve?.i18n) {
		const api = await initStorageComlink();

		i18n.api = api;
		i18n.ready = i18n.hydrateLocale('en');

		window.kbve = { api, i18n };
		console.log('[KBVE] Global API ready');
	} else {
		console.log('[KBVE] Already initialized');
	}
}

main();

if (typeof window !== 'undefined') {
	window.addEventListener('astro:after-swap', main);
}
