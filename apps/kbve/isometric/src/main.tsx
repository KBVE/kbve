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

/**
 * macOS WKWebView defers composition on transparent + click-through documents
 * (html/body with `pointer-events: none`). React mounts but paint stays stale
 * until devtools opens or the window resizes. Force a layout/resize on every
 * animation frame for the first ~600ms, then drop to a 500ms interval so
 * later UI state changes (chat panel opening, FPS counter updates) still get
 * composited.
 */
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

	// macOS WKWebView only reconfigures its compositor surface on real OS
	// window-size changes (opening devtools triggers this naturally). Multi-
	// stage nudge with a perceptible delta and a real delay so AppKit treats
	// it as a true resize event, not a coalesced no-op.
	(async () => {
		try {
			const winApi = await import('@tauri-apps/api/window');
			const w = winApi.getCurrentWindow();
			const size = await w.innerSize();
			const PhysicalSize = winApi.PhysicalSize;
			console.log('[paint] window-nudge starting; size=', size);
			await w.setSize(
				new PhysicalSize(size.width + 20, size.height + 20),
			);
			await new Promise((r) => setTimeout(r, 250));
			await w.setSize(new PhysicalSize(size.width, size.height));
			await new Promise((r) => setTimeout(r, 100));
			await w.setSize(new PhysicalSize(size.width + 1, size.height));
			await new Promise((r) => setTimeout(r, 100));
			await w.setSize(new PhysicalSize(size.width, size.height));
			console.log('[paint] window-nudge complete');
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

/**
 * Probe browser capabilities and persist to localStorage as JSON.
 * Run ONCE before WASM init so the Rust side can read a complete
 * ClientProfile without scattered JS interop calls.
 */
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
		// Private browsing or storage full — WASM will fall back to safe defaults.
		console.warn(
			'[profile] localStorage unavailable, WASM will use defaults',
		);
	}
	return profile;
}

async function bootstrap() {
	const profile = probeClientProfile();

	// Native Tauri build runs Bevy as a real Rust binary via wgpu and the
	// webview's raw window handle — DO NOT load the WASM game on top of it,
	// or two Bevy instances fight for input/render and wasm-bindgen
	// closures get invoked recursively (visible as "closure invoked
	// recursively or after being dropped" panics in the webview console).
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

	// Verify WebGPU is available before loading the WASM game
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

	// Load and initialize Bevy WASM — starts the game loop (non-blocking)
	// Tower-http serves pre-compressed .wasm.br/.wasm.gz transparently via Content-Encoding
	const wasmModule = await import('../wasm-pkg/isometric_game.js');
	const { default: init } = wasmModule;

	setLoadingProgress('Initializing WebGPU...', 60);

	const wasm = await init();

	// Hand the Supabase access token (resolved by the arcade page's
	// authBridge probe) to Bevy so the title screen flips straight to
	// "Signed in as X" and the netcode handshake starts without a Play
	// Online click. Awaiting the probe avoids a race where WASM finishes
	// init before the IndexedDB-backed session is read.
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
