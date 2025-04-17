import type { CommandPayload, SharedWorkerCommand } from "src/env";
const EXPECTED_SW_VERSION = '1.0.0';
let sharedPort: MessagePort | null = null;

type Listener = {
	resolve: (data: any) => void;
	reject: (err: any) => void;
};

const listeners = new Map<string, Listener>();

export function initCanvasWorker(canvas: HTMLCanvasElement, src: string): Promise<void> {
	const offscreen = canvas.transferControlToOffscreen();

	return useSharedWorkerCall('initCanvasWorker', { src, canvas: offscreen }, 10000, [offscreen]);
}

export function initSharedWorker(): MessagePort {
	if (!sharedPort) {
		//const worker = new SharedWorker('/js/shared-worker.js');
		const worker = new SharedWorker(new URL('./shared-worker', import.meta.url))

		sharedPort = worker.port;
		sharedPort.start();

		sharedPort.onmessage = (e: MessageEvent) => {
			console.log('[Worker] onmessage received:', e.data);

			const { type, payload, error, requestId, topic } = e.data;

			if (requestId && listeners.has(requestId)) {
				const { resolve, reject } = listeners.get(requestId)!;
				listeners.delete(requestId);
				error ? reject(error) : resolve(payload);
			} else if (requestId) {
				console.warn('[Client] Received unknown requestId:', requestId);
			}
		};
	}
	return sharedPort;
}

export function useSharedWorkerCall<T = any>(
	type: string,
	payload: any = {},
	timeoutMs = 10000, 
	transferables: Transferable[] = []
): Promise<T> {
	return new Promise((resolve, reject) => {
		const requestId = crypto.randomUUID();
		const port = initSharedWorker();

		const timeout = setTimeout(() => {
			listeners.delete(requestId);
			reject(new Error(`Request timed out: ${type}`));
		}, timeoutMs);

		listeners.set(requestId, {
			resolve: (data: T) => {
				clearTimeout(timeout);
				listeners.delete(requestId);
				resolve(data);
			},
			reject: (err: any) => {
				clearTimeout(timeout);
				listeners.delete(requestId);
				reject(err);
			}
		});

		port.postMessage({ type, payload, requestId }, transferables || []);
	});
}

export function subscribeToTopic<T = any>(
	topic: string,
	onMessage: (payload: T) => void
): () => void {
	const port = initSharedWorker();

	const handler = (e: MessageEvent) => {
		if (e.data.topic === topic) {
			onMessage(e.data.payload);
		}
	};

	port.addEventListener('message', handler);
	port.postMessage({ type: 'subscribe', topic });

	return () => {
		port.postMessage({ type: 'unsubscribe', topic });
		port.removeEventListener('message', handler);
	};
}


export async function registerServiceWorker() {
	if ('serviceWorker' in navigator) {
		try {
			const reg = await navigator.serviceWorker.register('/sw.js');
			console.log('[SharedWorker-Controlled] Service Worker registered');

			if (reg.active) {
				reg.active.postMessage({
					type: 'check-version',
					expectedVersion: EXPECTED_SW_VERSION,
				});

				setInterval(() => {
					reg.active?.postMessage({ type: 'ping' });
				}, 60_000);
			}

			navigator.serviceWorker.addEventListener('message', (event) => {
				if (event.data?.type === 'pong') {
					console.log('[SW] Pong received — version:', event.data.swVersion);
				}
			});

			return reg;
		} catch (err) {
			console.error('[SW] Registration failed:', err);
		}
	}
}

export function dispatchCommand<T extends SharedWorkerCommand['type']>(
	type: T,
	payload: CommandPayload<T>,
	transferables: Transferable[] = []
): Promise<any> {
	return useSharedWorkerCall(type, { type, ...payload }, 10000, transferables);
}

const customEventTarget = new EventTarget();

export function emitCustomEvent(name: string, detail?: any) {
	customEventTarget.dispatchEvent(new CustomEvent(name, { detail }));
}

export function onCustomEvent<T = any>(
	name: string,
	handler: (e: CustomEvent<T>) => void
): () => void {
	const wrapped = (e: Event) => handler(e as CustomEvent<T>);
	customEventTarget.addEventListener(name, wrapped);
	return () => customEventTarget.removeEventListener(name, wrapped);
}