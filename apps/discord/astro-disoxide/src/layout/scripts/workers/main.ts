import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import { persistentMap } from '@nanostores/persistent';
import type { LocalStorageAPI } from './db-worker';
import { initializeWorkerDatabase, type InitWorkerOptions } from './init';
import type { CanvasWorkerAPI } from './canvas-worker';



const EXPECTED_DB_VERSION = '1.0.2';

//	* Interface

export interface PanelPayload {
	rawHtml?: string;
	needsCanvas?: boolean;
	canvasOptions?: {
		width: number;
		height: number;
		mode?: 'static' | 'animated' | 'dynamic';
	};
}


//	* UIUX

const uiuxState = persistentMap<{
	panelManager: Record<'top' | 'right' | 'bottom' | 'left', {
		open: boolean;
		payload?: PanelPayload;
	}>;
	themeManager: { theme: 'light' | 'dark' | 'auto' };
	toastManager: Record<string, any>;
}>(
	'uiux-state',
	{
		panelManager: {
			top: { open: false },
			right: { open: false },
			bottom: { open: false },
			left: { open: false },
		},		themeManager: { theme: 'auto' },
		toastManager: {},
	},
	{
		encode: JSON.stringify,
		decode: JSON.parse,
	},
);

const canvasWorker = wrap<CanvasWorkerAPI>(
	new Worker(new URL('./canvas-worker', import.meta.url), { type: 'module' })
);


export const uiux = {
	state: uiuxState,
	worker: canvasWorker,
	openPanel(id: 'top' | 'right' | 'bottom' | 'left', payload?: PanelPayload) {
		const panels = { ...uiuxState.get().panelManager };
		panels[id] = { open: true, payload };
		uiuxState.setKey('panelManager', panels);
	},
	
	closePanel(id: 'top' | 'right' | 'bottom' | 'left') {
		const panels = { ...uiuxState.get().panelManager };
		panels[id] = { open: false, payload: undefined };
		uiuxState.setKey('panelManager', panels);
	},
	
	togglePanel(id: 'top' | 'right' | 'bottom' | 'left', payload?: PanelPayload) {
		const panels = { ...uiuxState.get().panelManager };
		const isOpen = panels[id]?.open ?? false;
		panels[id] = { open: !isOpen, payload: !isOpen ? payload : undefined };
		uiuxState.setKey('panelManager', panels);
	},	

	setTheme(theme: 'light' | 'dark' | 'auto') {
		uiuxState.setKey('themeManager', { theme });
	},

	addToast(id: string, data: any) {
		const toasts = { ...uiuxState.get().toastManager, [id]: data };
		uiuxState.setKey('toastManager', toasts);
	},

	removeToast(id: string) {
		const toasts = { ...uiuxState.get().toastManager };
		delete toasts[id];
		uiuxState.setKey('toastManager', toasts);
	},

	async dispatchCanvasRequest(
		panelId: 'top' | 'right' | 'bottom' | 'left',
		canvasEl: HTMLCanvasElement,
		mode: 'static' | 'animated' | 'dynamic' = 'animated'
	) {
		const offscreen = canvasEl.transferControlToOffscreen();
		await this.worker.bindCanvas(panelId, offscreen, mode);
	},

	closeAllPanels() {
		const panels = { ...uiuxState.get().panelManager };
		console.log('error panel is closing');
	
		for (const id of Object.keys(panels) as Array<'top' | 'right' | 'bottom' | 'left'>) {
			panels[id] = { open: false, payload: undefined };
		}
	
		uiuxState.setKey('panelManager', panels);
	},
};


//	* i18n

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

	if (!window.kbve?.api || !window.kbve?.i18n || !window.kbve?.uiux) {
		const api = await initStorageComlink();

		i18n.api = api;
		i18n.ready = i18n.hydrateLocale('en');

		window.kbve = { api, i18n, uiux };
		console.log('[KBVE] Global API ready');
	} else {
		console.log('[KBVE] Already initialized');
	}
}

main();
