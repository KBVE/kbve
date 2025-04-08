
let sharedPort: MessagePort | null = null;

type Listener = {
	resolve: (data: any) => void;
	reject: (err: any) => void;
};

const listeners = new Map<string, Listener>();

export function initSharedWorker(): MessagePort {
	if (!sharedPort) {
		//const worker = new SharedWorker('/js/shared-worker.js');
		const worker = new SharedWorker(new URL('./worker', import.meta.url))

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
	timeoutMs = 10000
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

		port.postMessage({ type, payload, requestId });
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
