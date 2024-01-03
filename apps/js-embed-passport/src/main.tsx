import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';

import App from './app/app';
import React from 'react';

const root = ReactDOM.createRoot(
	document.getElementById('kbve-passport') as HTMLElement
);
root.render(
	<StrictMode>
		<App />
	</StrictMode>
);
