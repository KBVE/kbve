import React from 'react';
import ReactDOM from 'react-dom/client';
import './app.css';
import { GameUIProvider } from './ui/provider/GameUIProvider';
import App from './App';

function setLoadingProgress(status: string, percent: number) {
	const el = document.getElementById('loading-status');
	const bar = document.getElementById('loading-bar');
	if (el) el.textContent = status;
	if (bar) bar.style.width = percent + '%';
}

function hideLoadingScreen() {
	const el = document.getElementById('game-loading');
	if (el) {
		el.style.opacity = '0';
		el.style.transition = 'opacity 0.4s ease';
		setTimeout(() => el.remove(), 400);
	}
}

async function bootstrap() {
	// Verify WebGPU is available before loading the WASM game
	if (!(navigator as unknown as { gpu?: unknown }).gpu) {
		const root = document.getElementById('root');
		if (root) {
			root.innerHTML =
				'<div style="color:#fff;padding:2rem;text-align:center">' +
				'<h2>WebGPU Not Available</h2>' +
				'<p>This browser does not support WebGPU (Chrome 113+, Edge 113+, Safari 18+).</p>' +
				'</div>';
			root.style.pointerEvents = 'auto';
		}
		return;
	}

	setLoadingProgress('Loading game module...', 20);

	// Load and initialize Bevy WASM — starts the game loop (non-blocking)
	// Tower-http serves pre-compressed .wasm.br/.wasm.gz transparently via Content-Encoding
	const { default: init } = await import('../wasm-pkg/isometric_game.js');

	setLoadingProgress('Initializing WebGPU...', 60);

	const wasm = await init();

	// Spawn web workers for WASM pthreads (chunk computation, etc.)
	// Only when SharedArrayBuffer is available (cross-origin isolated).
	if (
		typeof SharedArrayBuffer !== 'undefined' &&
		'worker_entry_point' in wasm
	) {
		const numWorkers = Math.max(
			1,
			(navigator.hardwareConcurrency || 4) - 1,
		);
		setLoadingProgress(`Spawning ${numWorkers} workers...`, 75);

		// wasm-bindgen doesn't export the WebAssembly.Module, so compile it ourselves.
		// The memory IS on instance.exports since we use --shared-memory.
		const wasmUrl = new URL(
			'../wasm-pkg/isometric_game_bg.wasm',
			import.meta.url,
		);
		const wasmMemory = (wasm as unknown as { memory: WebAssembly.Memory })
			.memory;
		// Resolve the wasm-bindgen JS URL for workers to import dynamically.
		const bindgenUrl = new URL(
			'../wasm-pkg/isometric_game.js',
			import.meta.url,
		).href;

		try {
			const wasmModule = await WebAssembly.compileStreaming(
				fetch(wasmUrl),
			);

			const base = import.meta.env.BASE_URL;
			for (let i = 0; i < numWorkers; i++) {
				const worker = new Worker(`${base}wasm-worker.js`, {
					type: 'module',
				});
				worker.postMessage({
					module: wasmModule,
					memory: wasmMemory,
					bindgenUrl,
				});
			}
			console.log(`[pthreads] Spawned ${numWorkers} WASM worker threads`);
		} catch (err) {
			console.warn('[pthreads] Failed to compile WASM for workers:', err);
		}
	}

	setLoadingProgress('Starting...', 90);

	// Render React UI overlay
	ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
		<React.StrictMode>
			<GameUIProvider>
				<App />
			</GameUIProvider>
		</React.StrictMode>,
	);

	setLoadingProgress('Ready', 100);
	hideLoadingScreen();
}

bootstrap().catch((err) => {
	setLoadingProgress('Failed to load game', 0);
	console.error(err);
});
