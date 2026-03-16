// Web Worker for WASM pthreads — receives compiled WASM module + shared memory
// from the main thread, instantiates the module, and calls the Rust entry point
// which starts polling the shared work queue.
//
// Usage from main thread:
//   const worker = new Worker('/wasm-worker.js');
//   worker.postMessage({ module: wasmModule, memory: wasmMemory });

// eslint-disable-next-line no-restricted-globals
self.onmessage = async function (e) {
	const { module, memory } = e.data;

	// Instantiate the WASM module with the same shared memory as the main thread.
	const imports = {
		env: { memory },
		// wasm-bindgen generates an __wbindgen_* import namespace.
		// We forward all imports from the main module's import object.
		// The main thread passes these along with module/memory.
		...(e.data.imports || {}),
	};

	try {
		const instance = await WebAssembly.instantiate(module, imports);

		// Call the Rust worker entry point — starts polling the shared work queue.
		// This function is exported by bevy_tasker via #[wasm_bindgen].
		if (instance.exports.worker_entry_point) {
			instance.exports.worker_entry_point();
		} else {
			console.error(
				'[wasm-worker] worker_entry_point not found in WASM exports',
			);
		}
	} catch (err) {
		console.error('[wasm-worker] Failed to instantiate WASM module:', err);
	}
};
