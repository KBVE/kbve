/// <reference lib="webworker" />
// Simplified DB worker for debugging

console.log('[DB Worker Simple] Starting...');

self.onmessage = (e) => {
	console.log('[DB Worker Simple] Received:', e.data);

	const { id, type } = e.data;

	if (type === 'ping') {
		console.log('[DB Worker Simple] Responding to ping');
		self.postMessage({ id, ok: true, data: 'pong' });
	} else {
		self.postMessage({ id, ok: false, error: 'Not implemented' });
	}
};

console.log('[DB Worker Simple] Ready');
