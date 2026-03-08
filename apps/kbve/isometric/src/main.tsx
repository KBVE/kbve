import React from 'react';
import ReactDOM from 'react-dom/client';
import './app.css';
import { GameUIProvider } from './ui/provider/GameUIProvider';
import App from './App';

async function bootstrap() {
	// Load and initialize Bevy WASM — starts the game loop (non-blocking)
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
