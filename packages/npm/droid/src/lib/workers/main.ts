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
import {
	addToast as _addToast,
	removeToast as _removeToast,
} from '../state/toasts';
import { openTooltip, closeTooltip, openModal, closeModal } from '../state/ui';
import {
	ToastPayloadSchema,
	TooltipPayloadSchema,
	ModalPayloadSchema,
} from '../types/ui-event-types';
import { SupabaseGateway } from '../gateway/SupabaseGateway';
import type { GatewayConfig } from '../gateway/types';
import { observeThemeChanges } from '../state/theme-sync';
import { OverlayManager } from '../state/overlay-manager';
import { showWelcomeToast } from '../state/welcome-toast';

const EXPECTED_DB_VERSION = '1.0.3';
let initialized = false;
let _initPromise: Promise<void> | null = null;

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
 * resolveWorkerURL which checks window.kbveWorkerURLs or /workers/{name}.
 */
function initSharedWorker(
	name: string,
	opts?: { workerRef?: SharedWorker; workerURL?: string },
): SharedWorker {
	if (opts?.workerRef) {
		opts.workerRef.port.start();
		return opts.workerRef;
	}

	const url = opts?.workerURL ?? resolveWorkerURL(name);
	const worker = new SharedWorker(url, { type: 'module' });
	worker.port.start();

	// Notify worker to clean up this port on tab close/reload
	window.addEventListener('beforeunload', () => {
		worker.port.postMessage({ type: 'close' });
	});

	return worker;
}

function initDedicatedWorker(
	name: string,
	opts?: { workerRef?: Worker; workerURL?: string },
): Worker {
	if (opts?.workerRef) return opts.workerRef;

	const url = opts?.workerURL ?? resolveWorkerURL(name);
	return new Worker(url, { type: 'module' });
}

function listenFirstConnect(port: MessagePort): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const handler = (e: MessageEvent) => {
			if (e.data?.type === 'first-connect') {
				resolve(true);
				port.removeEventListener('message', handler);
			} else if (e.data?.type === 'reconnect') {
				resolve(false);
				port.removeEventListener('message', handler);
			}
		};
		port.addEventListener('message', handler);
		setTimeout(() => {
			port.removeEventListener('message', handler);
			resolve(false);
		}, 5_000);
	});
}

async function initStorageComlink(opts?: {
	workerRef?: SharedWorker;
	workerURL?: string;
	i18nPath?: string;
	dataPath?: string;
}): Promise<{ api: Remote<LocalStorageAPI>; isFirstConnection: boolean }> {
	const worker = initSharedWorker('db-worker', opts);
	const firstPromise = listenFirstConnect(worker.port);
	const api = wrap<LocalStorageAPI>(worker.port);
	const finalApi = await finalize(api, {
		i18nPath: opts?.i18nPath,
		dataPath: opts?.dataPath,
	});
	const isFirstConnection = await firstPromise;
	return { api: finalApi, isFirstConnection };
}

async function initWsComlink(opts?: {
	workerRef?: SharedWorker;
	workerURL?: string;
}): Promise<{ ws: Remote<WSInstance>; isFirstConnection: boolean }> {
	const worker = initSharedWorker('ws-worker', opts);
	const firstPromise = listenFirstConnect(worker.port);
	const ws = wrap<WSInstance>(worker.port);
	const isFirstConnection = await firstPromise;
	return { ws, isFirstConnection };
}

async function initCanvasComlink(opts?: {
	workerRef?: Worker;
	workerURL?: string;
}): Promise<Remote<CanvasWorkerAPI>> {
	const worker = initDedicatedWorker('canvas-worker', opts);
	return wrap<CanvasWorkerAPI>(worker);
}

async function finalize(
	api: Remote<LocalStorageAPI>,
	initOpts?: { i18nPath?: string; dataPath?: string },
): Promise<Remote<LocalStorageAPI>> {
	const version = await api.getVersion();
	if (version !== EXPECTED_DB_VERSION) {
		await initializeWorkerDatabase(api, {
			version: EXPECTED_DB_VERSION,
			i18nPath: initOpts?.i18nPath,
			dataPath: initOpts?.dataPath,
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
		DroidEvents.emit('panel-open', { id, payload });
	},

	closePanel(id: PanelId) {
		const panels = { ...uiuxState.get().panelManager };
		panels[id] = { open: false, payload: undefined };
		uiuxState.setKey('panelManager', panels);
		DroidEvents.emit('panel-close', { id });
	},

	togglePanel(id: PanelId, payload?: PanelPayload) {
		const panels = { ...uiuxState.get().panelManager };
		const isOpen = panels[id]?.open ?? false;
		panels[id] = { open: !isOpen, payload: !isOpen ? payload : undefined };
		uiuxState.setKey('panelManager', panels);
		if (!isOpen) {
			DroidEvents.emit('panel-open', { id, payload });
		} else {
			DroidEvents.emit('panel-close', { id });
		}
	},

	setTheme(theme: 'light' | 'dark' | 'auto') {
		uiuxState.setKey('themeManager', { theme });
	},

	/** @deprecated Use addToast() from '@kbve/droid' state exports instead. */
	addToast(id: string, data: any) {
		console.warn(
			'[KBVE] uiux.addToast is deprecated. Use addToast() from @kbve/droid.',
		);
		const toasts = { ...uiuxState.get().toastManager, [id]: data };
		uiuxState.setKey('toastManager', toasts);
	},

	/** @deprecated Use removeToast() from '@kbve/droid' state exports instead. */
	removeToast(id: string) {
		console.warn(
			'[KBVE] uiux.removeToast is deprecated. Use removeToast() from @kbve/droid.',
		);
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
		await (window.kbve?.uiux as Record<string, any>)?.[
			'worker'
		]?.bindCanvas(panelId, offscreen, mode);
	},

	closeAllPanels() {
		const panels = { ...uiuxState.get().panelManager };
		for (const id of Object.keys(panels) as Array<PanelId>) {
			panels[id] = { open: false, payload: undefined };
		}
		uiuxState.setKey('panelManager', panels);
	},

	emitFromWorker(msg: any) {
		// Existing: VNode injection
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
			return;
		}

		// Toast from worker
		if (msg.type === 'toast' && msg.payload) {
			const parsed = ToastPayloadSchema.safeParse(msg.payload);
			if (!parsed.success) {
				console.error(
					'[KBVE] Invalid toast payload from worker:',
					parsed.error,
				);
				return;
			}
			_addToast(parsed.data);
			return;
		}
		if (msg.type === 'toast-remove' && msg.payload?.id) {
			_removeToast(msg.payload.id);
			return;
		}

		// Tooltip from worker
		if (msg.type === 'tooltip-open' && msg.payload) {
			const parsed = TooltipPayloadSchema.safeParse(msg.payload);
			if (!parsed.success) {
				console.error(
					'[KBVE] Invalid tooltip payload from worker:',
					parsed.error,
				);
				return;
			}
			openTooltip(parsed.data.id);
			return;
		}
		if (msg.type === 'tooltip-close') {
			closeTooltip(msg.payload?.id);
			return;
		}

		// Modal from worker
		if (msg.type === 'modal-open' && msg.payload) {
			const parsed = ModalPayloadSchema.safeParse(msg.payload);
			if (!parsed.success) {
				console.error(
					'[KBVE] Invalid modal payload from worker:',
					parsed.error,
				);
				return;
			}
			openModal(parsed.data.id);
			return;
		}
		if (msg.type === 'modal-close') {
			closeModal(msg.payload?.id);
			return;
		}

		console.warn('[KBVE] Unknown worker UI message type:', msg.type);
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
	i18nPath?: string;
	dataPath?: string;
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

	if (_initPromise) {
		await _initPromise;
		return;
	}

	const needsInit =
		!window.kbve?.api || !window.kbve?.i18n || !window.kbve?.uiux;

	if (needsInit) {
		_initPromise = (async () => {
			try {
				console.log('[DROID] Initializing workers...');

				const canvas = await initCanvasComlink({
					workerRef: opts?.workerRefs?.canvasWorker,
					workerURL: opts?.workerURLs?.['canvasWorker'],
				});

				const { api, isFirstConnection: dbFirst } =
					await initStorageComlink({
						workerURL:
							typeof opts?.workerURLs?.['dbWorker'] === 'string'
								? opts.workerURLs['dbWorker']
								: undefined,
						workerRef: opts?.workerRefs?.dbWorker,
						i18nPath: opts?.i18nPath,
						dataPath: opts?.dataPath,
					});

				const { ws, isFirstConnection: wsFirst } = await initWsComlink({
					workerRef: opts?.workerRefs?.wsWorker,
					workerURL: opts?.workerURLs?.['wsWorker'],
				});

				const isLeaderTab = dbFirst && wsFirst;

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

				const overlay = new OverlayManager({
					preferredPath: 'auto',
					canvasWorker: canvas,
				});

				window.kbve = {
					...(window.kbve || {}),
					api,
					i18n,
					uiux: { ...uiux, worker: canvas },
					ws,
					data,
					mod,
					events,
					overlay,
					...(gateway ? { gateway } : {}),
				};

				// Sync theme CSS vars to Dexie for worker access
				observeThemeChanges(api);

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

				if (isLeaderTab) {
					events.emit('droid-first-connect', {
						timestamp: Date.now(),
						workersFirst: { db: dbFirst, ws: wsFirst },
					});
				}

				showWelcomeToast();

				console.log('[KBVE] Global API ready');
			} catch (err) {
				_initPromise = null;
				console.error('[DROID] Initialization error:', err);
				throw err;
			}
		})();
		await _initPromise;
	} else {
		console.log('[KBVE] Already initialized');
	}
}
