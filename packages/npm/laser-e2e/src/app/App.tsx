import React, { useState } from 'react';
import { PhaserTest } from './PhaserTest';
import { R3FTest } from './R3FTest';

type View = 'menu' | 'phaser' | 'r3f' | 'both';

export const App: React.FC = () => {
	const [view, setView] = useState<View>('menu');

	return (
		<div data-testid="app-root">
			<nav data-testid="nav">
				<button data-testid="nav-phaser" onClick={() => setView('phaser')}>
					Phaser
				</button>
				<button data-testid="nav-r3f" onClick={() => setView('r3f')}>
					R3F
				</button>
				<button data-testid="nav-both" onClick={() => setView('both')}>
					Both
				</button>
				<button data-testid="nav-menu" onClick={() => setView('menu')}>
					Menu
				</button>
			</nav>

			{view === 'menu' && <p data-testid="menu-text">Select a test</p>}
			{(view === 'phaser' || view === 'both') && <PhaserTest />}
			{(view === 'r3f' || view === 'both') && <R3FTest />}
		</div>
	);
};
