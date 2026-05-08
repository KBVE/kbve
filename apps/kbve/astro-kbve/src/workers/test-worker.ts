/// <reference lib="webworker" />
// Simple test worker to verify worker loading works
export {};

console.log('[Test Worker] Starting...');

// Dedicated workers receive `event.origin === ''` from their owning page;
// reject anything else to satisfy CodeQL js/missing-origin-check.
function isAllowedOrigin(event: MessageEvent): boolean {
	return event.origin === '' || event.origin === self.location.origin;
}

self.onmessage = (e) => {
	if (!isAllowedOrigin(e)) {
		console.warn('[Test Worker] Rejected message from origin:', e.origin);
		return;
	}
	console.log('[Test Worker] Received message:', e.data);
	self.postMessage({ type: 'pong', data: e.data });
};

console.log('[Test Worker] Ready');
