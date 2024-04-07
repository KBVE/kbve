/**
 * Main entry point for the DreamBound Action RPG web application.
 * This script sets up the React rendering environment, incorporating
 * `react-helmet-async` for dynamic management of the document head,
 * and `StrictMode` for highlighting potential problems in an application.
 * 
 * Utilizes the `ReactDOM.createRoot` API to create a root container 
 * if it does not already exist, which enables React 18+ concurrent features.
 * 
 * @fileoverview Entry script for initializing the DreamBound Action RPG React application.
 * @requires react: Provides the React library necessary for defining JSX components.
 * @requires react-dom/client: Offers DOM-specific methods to enable efficient management of React components in the web browser.
 * @requires react-helmet-async: A performant, thread-safe, low-level library for managing <head> with React.
 * 
 * @example
 * // Typically, this file is used as an entry point and not imported elsewhere.
 * // It's included in a project's main HTML file via a <script type="module"> tag.
 */

import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import App from './app/app';

/**
 * FullApp wraps the primary App component with HelmetProvider for managing head elements
 * and sets the application's title using Helmet.
 * 
 * @returns {JSX.Element} The FullApp component, ready for rendering.
 */
const FullApp = () => (
	<HelmetProvider>
		<Helmet>
			<title>DreamBound Action RPG</title>
		</Helmet>
		<App />
	</HelmetProvider>
);

// Obtain a reference to the DOM element where the React app will be mounted.
const rootElement = document.getElementById('dreambound') as HTMLElement;

// Create a root container for the React application.
const root = ReactDOM.createRoot(rootElement);

// Render the FullApp component within the root container in strict mode.
root.render(
	<StrictMode>
		<FullApp />
	</StrictMode>,
);