import React from 'react';
import ReactDOM from 'react-dom/client';
import './app.css';
import { GameUIProvider } from './ui/provider/GameUIProvider';
import App from './App';

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
	// Tower-http serves pre-compressed .wasm.br/.wasm.gz transparently via Content-Encoding
	const { default: init } = await import('../wasm-pkg/isometric_game.js');
	await init();

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
