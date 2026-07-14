import './game/assetBase';
import './game/render/bvh';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { verifySab } from './game/sab/verify';
import { preloadPartSets } from './game/character/partsLoader';

verifySab();

const idle: (cb: () => void) => void =
	typeof requestIdleCallback === 'function'
		? (cb) => requestIdleCallback(cb, { timeout: 10_000 })
		: (cb) => setTimeout(cb, 3_000);
idle(preloadPartSets);

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
