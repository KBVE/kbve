import React from 'react';
import ReactDOM from 'react-dom/client';
import './app.css';
import { GameUIProvider } from './ui/provider/GameUIProvider';
import App from './App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<GameUIProvider>
			<App />
		</GameUIProvider>
	</React.StrictMode>,
);
