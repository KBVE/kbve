import React from 'react';
import ReactDOM from 'react-dom/client';
import './app.css';
import { GameUIProvider } from './ui/provider/GameUIProvider';
import App from './App';

function supportsDecompression(encoding: CompressionFormat | string): boolean {
	try {
		new DecompressionStream(encoding as CompressionFormat);
		return true;
	} catch {
		return false;
	}
}

async function fetchCompressedWasm(base: URL): Promise<WebAssembly.Module> {
	const variants: Array<{
		ext: string;
		encoding: CompressionFormat | string;
	}> = [];
	if (supportsDecompression('brotli'))
		variants.push({ ext: '.wasm.br', encoding: 'brotli' });
	variants.push({ ext: '.wasm.gz', encoding: 'gzip' });

	for (const { ext, encoding } of variants) {
		try {
			const res = await fetch(new URL('isometric_game_bg' + ext, base));
			if (!res.ok) continue;
			const decompressed = res.body!.pipeThrough(
				new DecompressionStream(encoding as CompressionFormat),
			);
			const bytes = await new Response(decompressed).arrayBuffer();
			return WebAssembly.compile(bytes);
		} catch {
			continue;
		}
	}
	throw new Error('Failed to load compressed WASM');
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

	// Load and initialize Bevy WASM — starts the game loop (non-blocking)
	const { default: init } = await import('../wasm-pkg/isometric_game.js');

	// Fetch pre-compressed WASM and decompress client-side (brotli → gzip fallback)
	const wasmBase = new URL('/isometric/assets/', window.location.origin);
	const wasmBytes = await fetchCompressedWasm(wasmBase);
	await init(wasmBytes);

	// Render React UI overlay
	ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
		<React.StrictMode>
			<GameUIProvider>
				<App />
			</GameUIProvider>
		</React.StrictMode>,
	);
}

bootstrap().catch(console.error);
