// Web Worker for WASM pthreads.
// Dynamically imports the wasm-bindgen JS and calls initSync + worker_entry_point.

// eslint-disable-next-line no-restricted-globals
self.onmessage = async (e) => {
	const { module, memory, bindgenUrl } = e.data;

	try {
		const bindgen = await import(bindgenUrl);

		// initSync with thread_stack_size initializes TLS for this worker
		// without running wasm_main() (the game start function).
		bindgen.initSync({ module, memory, thread_stack_size: 1048576 });

		// Start polling the shared work queue (bevy_tasker).
		bindgen.worker_entry_point();
		console.log('[wasm-worker] Worker started');
	} catch (err) {
		console.error('[wasm-worker] Failed to initialize:', err);
	}
};
