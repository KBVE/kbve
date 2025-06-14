import { wrap, transfer, proxy } from 'comlink';
import type { Remote } from 'comlink';
import { persistentMap } from '@nanostores/persistent';
import type { LocalStorageAPI } from './db-worker';
import type { WSInstance } from './ws-worker';
import { initializeWorkerDatabase, type InitWorkerOptions } from './init';
import type { CanvasWorkerAPI } from './canvas-worker';
import { getModManager } from '../mod/mod-manager';
import { scopeData } from './data';
import { dispatchAsync, renderVNode } from './tools';
import type { PanelPayload, PanelId } from '../types/panel-types';
import { DroidEvents } from './events';

const EXPECTED_DB_VERSION = '1.0.3';

export function resolveWorkerURL(name: string, fallback?: string): string {
	if (!name) throw new Error('[resolveWorkerURL] Worker name must be defined');

	if (typeof window !== 'undefined') {
		const globalMap = (window as any).kbveWorkerURLs;
		if (globalMap?.[name]) return globalMap[name];
	}

	// No bundler-specific resolution: just return fallback or root-relative
	return fallback ?? `/workers/${name}`;
}

//	* DeepProxy
function deepProxy<T>(obj: T): T {
	if (typeof obj === 'function') return proxy(obj) as T;

	if (obj && typeof obj === 'object') {
		const result: any = Array.isArray(obj) ? [] : {};
		for (const key in obj) {
			result[key] = deepProxy(obj[key]);
		}
		return result;
	}

	return obj;
}

async function initWsComlink(workerURL?: string): Promise<Remote<WSInstance>> {
	const url = workerURL ?? resolveWorkerURL('ws-worker.js');
	const worker = new SharedWorker(url, { type: 'module' });
	worker.port.start();
	return wrap<WSInstance>(worker.port);
}

//	* UIUX
const uiuxState = persistentMap<{
	panelManager: Record<
		PanelId,
		{
			open: boolean;
			payload?: PanelPayload;
		}
	>;
	themeManager: { theme: 'light' | 'dark' | 'auto' };
	toastManager: Record<string, any>;
	scrollY: number;
}>(
	'uiux-state',
	{
		panelManager: {
			top: { open: false },
			right: { open: false },
			bottom: { open: false },
			left: { open: false },
		},
		themeManager: { theme: 'auto' },
		toastManager: {},
		scrollY: 0,
	},
	{
		encode: JSON.stringify,
		decode: JSON.parse,
	},
);

async function initCanvasComlink(opts?: {
  workerRef?: Worker;
  workerURL?: string;
}): Promise<Remote<CanvasWorkerAPI>> {
  // 1. Try Vite-style import resolution
  try {
    const worker = new Worker(new URL('./workers/canvas-worker.ts', import.meta.url), { type: 'module' });
    return wrap<CanvasWorkerAPI>(worker);
  } catch (err) {
    console.warn('[DROID] Vite-style canvas-worker import failed:', err);
  }

  // 2. Try hardcoded path fallback
  try {
    const worker = new Worker('/workers/canvas-worker.js', { type: 'module' });
    return wrap<CanvasWorkerAPI>(worker);
  } catch (err) {
    console.warn('[DROID] Fallback /canvas-worker.js failed:', err);
  }

  // 3. Try direct Worker instance
  if (opts?.workerRef) {
    try {
      return wrap<CanvasWorkerAPI>(opts.workerRef);
    } catch (err) {
      console.warn('[DROID] Provided workerRef failed:', err);
    }
  }

  // 4. Try provided URL
  if (opts?.workerURL) {
    try {
      const worker = new Worker(opts.workerURL, { type: 'module' });
      return wrap<CanvasWorkerAPI>(worker);
    } catch (err) {
      console.warn('[DROID] Provided workerURL failed:', err);
    }
  }

  // 5. Failure
  console.error('[DROID] No Canvas Comlink Initialized');
  throw new Error('[DROID] Failed to initialize canvas worker');
}

export const uiux = {
	state: uiuxState,
	openPanel(id: PanelId, payload?: PanelPayload) {
		const panels = { ...uiuxState.get().panelManager };
		panels[id] = { open: true, payload };
		uiuxState.setKey('panelManager', panels);
	},

	closePanel(id: PanelId) {
		const panels = { ...uiuxState.get().panelManager };
		panels[id] = { open: false, payload: undefined };
		uiuxState.setKey('panelManager', panels);
	},

	togglePanel(id: PanelId, payload?: PanelPayload) {
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
		panelId: PanelId,
		canvasEl: HTMLCanvasElement,
		mode: 'static' | 'animated' | 'dynamic' = 'animated',
	) {
		const offscreen = canvasEl.transferControlToOffscreen();
		await window.kbve?.uiux?.worker?.bindCanvas(panelId, offscreen, mode);
	},

	closeAllPanels() {
		const panels = { ...uiuxState.get().panelManager };
		console.log('error panel is closing');

		for (const id of Object.keys(panels) as Array<PanelId>) {
			panels[id] = { open: false, payload: undefined };
		}

		uiuxState.setKey('panelManager', panels);
	},

	emitFromWorker(msg: any) {
		if (msg.type === 'injectVNode' && msg.vnode) {
			dispatchAsync(() => {
				const target = document.getElementById('bento-grid-inject');
				if (!target) {
					console.warn(
						'[KBVE] No injection target found: #bento-grid-inject',
					);
					return;
				}

				const el = renderVNode(msg.vnode);
				el.classList.add('animate-fade-in');
				if (msg.vnode.id) {
					const existing = document.getElementById(msg.vnode.id);
					if (existing) existing.remove();
				}

				target.appendChild(el);
			});
		}
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

async function initStorageComlink(
	workerURL?: string,
): Promise<Remote<LocalStorageAPI>> {
	const url = workerURL ?? resolveWorkerURL('db-worker.js');

	const worker = new SharedWorker(url, { type: 'module' });
	worker.port.start();
	const api = wrap<LocalStorageAPI>(worker.port);

	const version = await api.getVersion();
	if (version !== EXPECTED_DB_VERSION) {
		await initializeWorkerDatabase(api, {
			version: EXPECTED_DB_VERSION,
			i18nPath: 'https://discord.sh/i18n/db.json',
			locale: 'en',
			defaults: { welcome: 'Welcome!', theme: 'dark' },
		});
	}

	return api;
}

let initialized = false;

// * Bridge
export function bridgeWsToDb(
	ws: Remote<WSInstance>,
	db: Remote<LocalStorageAPI>,
) {
	const handler = proxy(async (buf: ArrayBuffer) => {
		dispatchAsync(() => {
			const key = `ws:${Date.now()}`;
			void db.storeWsMessage(key, buf);
		});
	});

	ws.onMessage(transfer(handler, [0]));
}

//	*	MAIN
export async function main(opts?: {
  workerURLs?: Record<string, string>;
  workerRefs?: {
    canvasWorker?: Worker;
    dbWorker?: SharedWorker;
    wsWorker?: SharedWorker;
  };
}) {

	
	console.log('[DROID]: Main<T>');

	if (!initialized) {
		initialized = true;

		// Attach to existing service worker (or wait for one to take control)
		if (navigator.serviceWorker?.controller) {
			initSWComlink();
		} else {
			navigator.serviceWorker?.addEventListener(
				'controllerchange',
				initSWComlink,
			);
		}
	}

	console.log('[DROID] Main<T> => Worker URLs', opts?.workerURLs);

	const needsInit =
		!window.kbve?.api || !window.kbve?.i18n || !window.kbve?.uiux;

	if (needsInit) {
		try {
			console.log('[DROID] Main<T> => Worker => CanvasComlink');
			const canvas = await initCanvasComlink({
				workerRef: opts?.workerRefs?.canvasWorker,
				workerURL: opts?.workerURLs?.['canvasWorker'],
			});
			console.log('[DROID] Main<T> => Worker => StorageComlink');
			const api = await initStorageComlink(
				typeof opts?.workerURLs?.['dbWorker'] === 'string' ? opts.workerURLs['dbWorker'] : undefined
			);
			console.log('[DROID] Main<T> => Worker => WsComlink');	
			const ws = await initWsComlink(
				typeof opts?.workerURLs?.['wsWorker'] === 'string' ? opts.workerURLs['wsWorker'] : undefined
			);
			console.log('[DROID] Main<T> => Worker => ModManager');
			const mod = await getModManager((url) => opts?.workerURLs?.[url] ?? url);
			const events = DroidEvents;

			for (const handle of Object.values(mod.registry)) {
				if (typeof handle.instance.init === 'function') {
					await handle.instance.init({
						emitFromWorker: uiux.emitFromWorker,
					});
				}
				console.log('[Event] -> Fire Mod Ready');
				events.emit('droid-mod-ready', {
					meta: handle.meta,
					timestamp: Date.now(),
				});
			}

			bridgeWsToDb(ws, api);

			const data = scopeData;
			i18n.api = api;
			i18n.ready = i18n.hydrateLocale('en');

			window.kbve = {
				...(window.kbve || {}),
				api,
				i18n,
				uiux: { ...uiux, worker: canvas },
				ws,
				data,
				mod,
				events,
			};

			await i18n.ready;

			window.kbve.events.emit('droid-ready', {
				timestamp: Date.now(),
			});

			document.addEventListener('astro:page-load', () => {
				console.debug(
					'[KBVE] Re-dispatched droid-ready after astro:page-load',
				);
				window.kbve?.events.emit('droid-ready', {
					timestamp: Date.now(),
				});
			});

			console.log('[KBVE] Global API ready');
		} catch (err) {
			console.error('[DROID] Initialization error:', err);
			throw err;
		}
	} else {
		console.log('[KBVE] Already initialized');
	}
}
