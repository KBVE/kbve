/**
 * SharedWorker source for `/api/sitegraph.json`.
 *
 * Shipped as a string and instantiated via Blob URL so the package can be
 * consumed without bundler-specific worker plumbing. The worker keeps one
 * cached payload per endpoint; all connected ports get the same data.
 *
 * Protocol (port → worker):
 *   { type: 'get', endpoint: string, requestId: string }
 *
 * Replies (worker → port):
 *   { type: 'data', requestId, data }
 *   { type: 'error', requestId, message }
 */
export const SITE_GRAPH_WORKER_SOURCE = String.raw`
const cache = new Map();
const pending = new Map();

self.onconnect = (event) => {
	const port = event.ports[0];
	port.onmessage = async (msg) => {
		const data = msg.data || {};
		if (data.type !== 'get') return;
		const { endpoint, requestId } = data;
		try {
			let payload = cache.get(endpoint);
			if (!payload) {
				let promise = pending.get(endpoint);
				if (!promise) {
					promise = fetch(endpoint).then((res) => {
						if (!res.ok) throw new Error('HTTP ' + res.status);
						return res.json();
					});
					pending.set(endpoint, promise);
				}
				payload = await promise;
				cache.set(endpoint, payload);
				pending.delete(endpoint);
			}
			port.postMessage({ type: 'data', requestId, data: payload });
		} catch (err) {
			pending.delete(endpoint);
			port.postMessage({
				type: 'error',
				requestId,
				message: err && err.message ? err.message : String(err),
			});
		}
	};
	port.start();
};
`;
