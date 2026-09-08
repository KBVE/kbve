import React from 'react';
import ReactDOM from 'react-dom/client';
import { initObserv } from '@kbve/observ';
import App from './App';
import './app.css';

initObserv({
	endpoint: 'https://metrics.kbve.com/api/v1/ingest/errors',
	project: 'chuck-launcher',
	platform: 'desktop',
	environment: import.meta.env.MODE,
});

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
