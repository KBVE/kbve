import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initViews } from './views';
import './app.css';

// Register all views before React mounts — registry is populated synchronously
initViews();

// Module graph linked fine — clear the boot-guard's one-shot retry flag.
sessionStorage.removeItem('kbve-boot-retry');

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
