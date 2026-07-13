import './game/assetBase';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { verifySab } from './game/sab/verify';

verifySab();

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
