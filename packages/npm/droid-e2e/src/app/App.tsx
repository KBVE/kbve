import { useState } from 'react';
import { WorkerTest } from './WorkerTest';
import { GatewayTest } from './GatewayTest';
import { EventBusTest } from './EventBusTest';

type View = 'menu' | 'workers' | 'gateway' | 'events' | 'all';

export function App() {
	const [view, setView] = useState<View>('menu');

	return (
		<div data-testid="droid-e2e-root" style={{ padding: '1rem', fontFamily: 'sans-serif' }}>
			<h1>Droid E2E Test Harness</h1>

			<nav data-testid="nav" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
				<button data-testid="nav-workers" onClick={() => setView('workers')}>
					Workers
				</button>
				<button data-testid="nav-gateway" onClick={() => setView('gateway')}>
					Gateway
				</button>
				<button data-testid="nav-events" onClick={() => setView('events')}>
					Events
				</button>
				<button data-testid="nav-all" onClick={() => setView('all')}>
					All
				</button>
				<button data-testid="nav-menu" onClick={() => setView('menu')}>
					Menu
				</button>
			</nav>

			{view === 'menu' && (
				<div data-testid="menu-view">
					<p>Select a test suite from the navigation above.</p>
				</div>
			)}

			{(view === 'workers' || view === 'all') && <WorkerTest />}
			{(view === 'gateway' || view === 'all') && <GatewayTest />}
			{(view === 'events' || view === 'all') && <EventBusTest />}
		</div>
	);
}
