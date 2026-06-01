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

// macOS WKWebView defers DOM composition on transparent + click-through
// documents until something triggers a real OS resize (Web Inspector does
// this naturally). Force a layout pulse + a stepped window-size nudge so
// the React overlay paints from boot instead of staying invisible.
function kickPaint() {
	const force = () => {
		document.documentElement.getBoundingClientRect();
		window.dispatchEvent(new Event('resize'));
	};
	let kicks = 0;
	const rafTick = () => {
		force();
		if (++kicks < 36) requestAnimationFrame(rafTick);
	};
	requestAnimationFrame(rafTick);
	setInterval(force, 500);

	(async () => {
		try {
			const winApi = await import('@tauri-apps/api/window');
			const w = winApi.getCurrentWindow();
			const size = await w.innerSize();
			const PhysicalSize = winApi.PhysicalSize;
			await w.setSize(
				new PhysicalSize(size.width + 20, size.height + 20),
			);
			await new Promise((r) => setTimeout(r, 250));
			await w.setSize(new PhysicalSize(size.width, size.height));
			await new Promise((r) => setTimeout(r, 100));
			await w.setSize(new PhysicalSize(size.width + 1, size.height));
			await new Promise((r) => setTimeout(r, 100));
			await w.setSize(new PhysicalSize(size.width, size.height));
		} catch (err) {
			console.warn('[paint] window-nudge failed', err);
		}
	})();
}

function hideLoadingScreen() {
	const el = document.getElementById('game-loading');
	if (el) {
		el.style.opacity = '0';
		el.style.transition = 'opacity 0.4s ease';
		setTimeout(() => el.remove(), 400);
	}
}

function resolveEndpoints() {
	const hostname = window.location.hostname;
	const protocol = window.location.protocol;
	const isSecure = protocol === 'https:';
	const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
	const wsScheme = isSecure ? 'wss' : 'ws';

	if (isLocal) {
		const port = window.location.port || (isSecure ? '443' : '80');
		return {
			api_base: `${protocol}//${hostname}:${port}`,
			ws_url: `${wsScheme}://${hostname}:5000`,
			wt_url: `https://${hostname}:5001`,
		};
	}
	return {
		api_base: `https://${hostname}`,
		ws_url: `wss://${hostname}/ws`,
		wt_url: `https://wt.${hostname}:5001`,
	};
}

function probeClientProfile() {
	const g = globalThis as Record<string, unknown>;
	const endpoints = resolveEndpoints();
	const profile = {
		secure_context:
			window.location.protocol === 'https:' ||
			window.location.hostname === 'localhost',
		has_webgpu: !!(navigator as unknown as { gpu?: unknown }).gpu,
		has_webtransport: typeof g.WebTransport === 'function',
		has_shared_array_buffer: typeof g.SharedArrayBuffer !== 'undefined',
		has_offscreen_canvas: typeof g.OffscreenCanvas === 'function',
		hardware_concurrency: navigator.hardwareConcurrency || 1,
		...endpoints,
		timestamp: Date.now(),
	};
	try {
		localStorage.setItem('kbve_client_profile', JSON.stringify(profile));
	} catch {
		console.warn(
			'[profile] localStorage unavailable, WASM will use defaults',
		);
	}
	return profile;
}

async function bootstrap() {
	const profile = probeClientProfile();

	// Native Tauri runs Bevy as a real Rust binary on the webview's raw
	// window. Loading the WASM build on top of it spawns a second Bevy +
	// recursive wasm-bindgen closures and crashes the webview.
	const isTauri = !!(
		(
			window as typeof window & {
				__TAURI_INTERNALS__?: unknown;
				__TAURI__?: unknown;
			}
		).__TAURI_INTERNALS__ ||
		(window as typeof window & { __TAURI__?: unknown }).__TAURI__
	);
	if (isTauri) {
		setLoadingProgress('Native build — mounting UI', 80);
		const root = document.getElementById('root');
		if (root) {
			ReactDOM.createRoot(root).render(
				<React.StrictMode>
					<GameUIProvider>
						<App />
					</GameUIProvider>
				</React.StrictMode>,
			);
			kickPaint();
		}
		setLoadingProgress('Ready', 100);
		hideLoadingScreen();
		return;
	}

	if (!profile.has_webgpu) {
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

	const wasmModule = await import('../wasm-pkg/isometric_game.js');
	const { default: init } = wasmModule;

	setLoadingProgress('Initializing WebGPU...', 60);

	const wasm = await init();

	// Await the Supabase session probe so set_signed_in fires before
	// netcode handshake — otherwise WASM races the IndexedDB read.
	const probe = (
		window as Window & {
			__KBVE_SESSION_PROBE__?: Promise<string | null>;
		}
	).__KBVE_SESSION_PROBE__;
	const initialJwt = probe ? await probe : null;
	if (initialJwt && typeof wasmModule.set_signed_in === 'function') {
		try {
			wasmModule.set_signed_in(initialJwt);
		} catch (err) {
			console.warn('[auth] set_signed_in threw', err);
		}
	}

	// WASM pthreads via web workers, only when SharedArrayBuffer is
	// available (cross-origin isolated context).
	if (
		typeof SharedArrayBuffer !== 'undefined' &&
		'worker_entry_point' in wasm
	) {
		const numWorkers = Math.max(
			1,
			(navigator.hardwareConcurrency || 4) - 1,
		);
		setLoadingProgress(`Spawning ${numWorkers} workers...`, 75);

		const wasmUrl = new URL(
			'../wasm-pkg/isometric_game_bg.wasm',
			import.meta.url,
		);
		const wasmMemory = (wasm as unknown as { memory: WebAssembly.Memory })
			.memory;
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
		} catch (err) {
			console.warn('[pthreads] worker setup failed', err);
		}
	}

	setLoadingProgress('Starting...', 90);

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
