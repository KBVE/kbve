/// <reference lib="webworker" />
// Simple test worker to verify worker loading works

console.log('[Test Worker] Starting...');

self.onmessage = (e) => {
	console.log('[Test Worker] Received message:', e.data);
	self.postMessage({ type: 'pong', data: e.data });
};

console.log('[Test Worker] Ready');
