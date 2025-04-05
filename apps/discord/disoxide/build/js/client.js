let sharedPort = null;
const listeners = new Map();

export function initSharedWorker() {
	if (!sharedPort) {
		const worker = new SharedWorker('/js/shared-worker.js');
		sharedPort = worker.port;
		sharedPort.start();

		sharedPort.onmessage = (e) => {
			const { type, payload, error, requestId, topic } = e.data;

			if (requestId && listeners.has(requestId)) {
				const { resolve, reject } = listeners.get(requestId);
				listeners.delete(requestId);
				error ? reject(error) : resolve(payload);
			}
		};
	}
	return sharedPort;
}

export function useSharedWorkerCall(type, payload = {}, timeoutMs = 5000) {
	return new Promise((resolve, reject) => {
		const requestId = `req_${Date.now()}_${Math.random()}`;
		const port = initSharedWorker();

		const timeout = setTimeout(() => {
			listeners.delete(requestId);
			reject(new Error(`Request timed out: ${type}`));
		}, timeoutMs);

		listeners.set(requestId, {
			resolve: (data) => {
				clearTimeout(timeout);
				listeners.delete(requestId);
				resolve(data);
			},
			reject: (err) => {
				clearTimeout(timeout);
				listeners.delete(requestId);
				reject(err);
			}
		});

		port.postMessage({ type, ...payload, requestId });
	});
}

export function subscribeToTopic(topic, onMessage) {
	const port = initSharedWorker();

	const handler = (e) => {
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
