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
import { SupabaseGateway } from '../gateway/SupabaseGateway';
import type { GatewayConfig } from '../gateway/types';

const EXPECTED_DB_VERSION = '1.0.3';
let initialized = false;

export function resolveWorkerURL(name: string, fallback?: string): string {
	if (!name)
		throw new Error('[resolveWorkerURL] Worker name must be defined');

	if (typeof window !== 'undefined') {
		const globalMap = (window as any).kbveWorkerURLs;
		if (globalMap?.[name]) return globalMap[name];
	}

	return fallback ?? `/workers/${name}`;
}

// --- Worker Init Helpers ---

/**
 * Simplified worker init — tries provided ref/URL, then falls back to
 * import.meta.url-relative paths (.ts for dev, .js for prod).
 */
function initSharedWorker(
	name: string,
	opts?: { workerRef?: SharedWorker; workerURL?: string },
): SharedWorker {
	if (opts?.workerRef) {
		opts.workerRef.port.start();
		return opts.workerRef;
	}

	if (opts?.workerURL) {
		const worker = new SharedWorker(opts.workerURL, { type: 'module' });
		worker.port.start();
		return worker;
	}

	// Try .js (production build output)
	try {
		const worker = new SharedWorker(
			new URL(`./${name}.js`, import.meta.url),
			{ type: 'module' },
		);
		worker.port.start();
		return worker;
	} catch {
		// Fallback to .ts (Vite dev)
		const worker = new SharedWorker(
			new URL(`./${name}.ts`, import.meta.url),
			{ type: 'module' },
		);
		worker.port.start();
		return worker;
	}
}

function initDedicatedWorker(
	name: string,
	opts?: { workerRef?: Worker; workerURL?: string },
): Worker {
	if (opts?.workerRef) return opts.workerRef;

	if (opts?.workerURL) {
		return new Worker(opts.workerURL, { type: 'module' });
	}

	try {
		return new Worker(
			new URL(`./${name}.js`, import.meta.url),
			{ type: 'module' },
		);
	} catch {
		return new Worker(
			new URL(`./${name}.ts`, import.meta.url),
			{ type: 'module' },
		);
	}
}

async function initStorageComlink(opts?: {
	workerRef?: SharedWorker;
	workerURL?: string;
}): Promise<Remote<LocalStorageAPI>> {
	const worker = initSharedWorker('db-worker', opts);
	const api = wrap<LocalStorageAPI>(worker.port);
	return await finalize(api);
}

async function initWsComlink(opts?: {
	workerRef?: SharedWorker;
	workerURL?: string;
}): Promise<Remote<WSInstance>> {
	const worker = initSharedWorker('ws-worker', opts);
	return wrap<WSInstance>(worker.port);
}

async function initCanvasComlink(opts?: {
	workerRef?: Worker;
	workerURL?: string;
}): Promise<Remote<CanvasWorkerAPI>> {
	const worker = initDedicatedWorker('canvas-worker', opts);
	return wrap<CanvasWorkerAPI>(worker);
}

async function finalize(api: Remote<LocalStorageAPI>): Promise<Remote<LocalStorageAPI>> {
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

// --- UIUX ---

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
					console.warn('[KBVE] No injection target found: #bento-grid-inject');
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

// --- i18n ---

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

// --- Bridge ---
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

	ws.onMessage(handler);
}

// --- MAIN ---
export async function main(opts?: {
	workerURLs?: Record<string, string>;
	workerRefs?: {
		canvasWorker?: Worker;
		dbWorker?: SharedWorker;
		wsWorker?: SharedWorker;
	};
	gateway?: GatewayConfig;
}) {
	console.log('[DROID]: Main<T>');

	if (!initialized) {
		initialized = true;

		if (navigator.serviceWorker?.controller) {
			initSWComlink();
		} else {
			navigator.serviceWorker?.addEventListener(
				'controllerchange',
				initSWComlink,
			);
		}
	}

	const needsInit =
		!window.kbve?.api || !window.kbve?.i18n || !window.kbve?.uiux;

	if (needsInit) {
		try {
			console.log('[DROID] Initializing workers...');

			const canvas = await initCanvasComlink({
				workerRef: opts?.workerRefs?.canvasWorker,
				workerURL: opts?.workerURLs?.['canvasWorker'],
			});

			const api = await initStorageComlink({
				workerURL: typeof opts?.workerURLs?.['dbWorker'] === 'string'
					? opts.workerURLs['dbWorker']
					: undefined,
				workerRef: opts?.workerRefs?.dbWorker,
			});

			const ws = await initWsComlink({
				workerRef: opts?.workerRefs?.wsWorker,
				workerURL: opts?.workerURLs?.['wsWorker'],
			});

			console.log('[DROID] Initializing mod manager...');
			const mod = await getModManager(
				(url) => opts?.workerURLs?.[url] ?? url,
			);
			const events = DroidEvents;

			for (const handle of Object.values(mod.registry)) {
				if (typeof handle.instance.init === 'function') {
					await handle.instance.init({
						emitFromWorker: uiux.emitFromWorker,
					});
				}
				events.emit('droid-mod-ready', {
					meta: handle.meta,
					timestamp: Date.now(),
				});
			}

			bridgeWsToDb(ws, api);

			const data = scopeData;
			i18n.api = api;
			i18n.ready = i18n.hydrateLocale('en');

			// Initialize SupabaseGateway if config is provided
			let gateway: SupabaseGateway | undefined;
			if (opts?.gateway) {
				console.log('[DROID] Initializing SupabaseGateway...');
				gateway = new SupabaseGateway(opts.gateway);
			}

			window.kbve = {
				...(window.kbve || {}),
				api,
				i18n,
				uiux: { ...uiux, worker: canvas },
				ws,
				data,
				mod,
				events,
				...(gateway ? { gateway } : {}),
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
