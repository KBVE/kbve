import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { Helmet, HelmetProvider } from 'react-helmet-async';


import App from './app/app';

const FullApp = () => (
    <HelmetProvider>
        <Helmet>
            <title>The TravelBox Game</title>
        </Helmet>
        <App />
    </HelmetProvider>
);


const root = ReactDOM.createRoot(document.getElementById('travelbox') as HTMLElement);
root.render(
<StrictMode><FullApp /></StrictMode>
);
