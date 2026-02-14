import React, { useState } from 'react';
import { HashTest } from './HashTest';
import { AesTest } from './AesTest';
import { KdfTest } from './KdfTest';
import { PgpTest } from './PgpTest';
import { StorageTest } from './StorageTest';

type View = 'menu' | 'hash' | 'aes' | 'kdf' | 'pgp' | 'storage';

export const App: React.FC = () => {
	const [view, setView] = useState<View>('menu');

	return (
		<div data-testid="app-root">
			<nav data-testid="nav">
				<button data-testid="nav-hash" onClick={() => setView('hash')}>
					Hash
				</button>
				<button data-testid="nav-aes" onClick={() => setView('aes')}>
					AES
				</button>
				<button data-testid="nav-kdf" onClick={() => setView('kdf')}>
					KDF
				</button>
				<button data-testid="nav-pgp" onClick={() => setView('pgp')}>
					PGP
				</button>
				<button
					data-testid="nav-storage"
					onClick={() => setView('storage')}
				>
					Storage
				</button>
				<button data-testid="nav-menu" onClick={() => setView('menu')}>
					Menu
				</button>
			</nav>

			{view === 'menu' && <p data-testid="menu-text">Select a test</p>}
			{view === 'hash' && <HashTest />}
			{view === 'aes' && <AesTest />}
			{view === 'kdf' && <KdfTest />}
			{view === 'pgp' && <PgpTest />}
			{view === 'storage' && <StorageTest />}
		</div>
	);
};
