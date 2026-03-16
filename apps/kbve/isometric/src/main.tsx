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
	if (typeof SharedArrayBuffer !== 'undefined' && wasm?.worker_entry_point) {
		const numWorkers = Math.max(
			1,
			(navigator.hardwareConcurrency || 4) - 1,
		);
		setLoadingProgress(`Spawning ${numWorkers} workers...`, 75);

		const wasmModule = (
			wasm as unknown as { __wbg_module: WebAssembly.Module }
		).__wbg_module;
		const wasmMemory = (
			wasm as unknown as { __wbg_memory: WebAssembly.Memory }
		).__wbg_memory;

		if (wasmModule && wasmMemory) {
			for (let i = 0; i < numWorkers; i++) {
				const worker = new Worker('/wasm-worker.js');
				worker.postMessage({ module: wasmModule, memory: wasmMemory });
			}
			console.log(`[pthreads] Spawned ${numWorkers} WASM worker threads`);
		} else {
			console.warn(
				'[pthreads] Could not access WASM module/memory for worker spawning',
			);
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
