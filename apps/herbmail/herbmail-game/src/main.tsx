import React from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { App } from './app/App';
import { verifySab } from './game/sab/verify';

const ASSET_BASE = import.meta.env.BASE_URL;
THREE.DefaultLoadingManager.setURLModifier((url) =>
	url.startsWith('/') && !url.startsWith('//')
		? ASSET_BASE + url.slice(1)
		: url,
);

verifySab();

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
