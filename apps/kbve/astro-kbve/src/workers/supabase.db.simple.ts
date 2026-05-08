/// <reference lib="webworker" />
// Simplified DB worker for debugging
export {};

console.log('[DB Worker Simple] Starting...');

// Dedicated workers receive `event.origin === ''` from their owning page;
// reject anything else to satisfy CodeQL js/missing-origin-check.
function isAllowedOrigin(event: MessageEvent): boolean {
	return event.origin === '' || event.origin === self.location.origin;
}

self.onmessage = (e) => {
	if (!isAllowedOrigin(e)) {
		console.warn(
			'[DB Worker Simple] Rejected message from origin:',
			e.origin,
		);
		return;
	}
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
