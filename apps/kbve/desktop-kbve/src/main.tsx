import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initViews } from './views';
import './app.css';

// Register all views before React mounts — registry is populated synchronously
initViews();

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
