import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { Helmet, HelmetProvider } from 'react-helmet-async';


import App from './app/app';

const FullApp = () => (
    <HelmetProvider>
        <Helmet>
            <title>Fish and Chip Adventures</title>
        </Helmet>
        <App />
    </HelmetProvider>
);

const root = ReactDOM.createRoot(document.getElementById('fishchip') as HTMLElement);
root.render(
<StrictMode><FullApp /></StrictMode>
);
