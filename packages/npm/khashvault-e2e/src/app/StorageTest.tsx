import React, { useState } from 'react';
import { generateAesKey, SecureLocalStorage } from '@kbve/khashvault';

export const StorageTest: React.FC = () => {
	const [storeResult, setStoreResult] = useState('');
	const [retrieveResult, setRetrieveResult] = useState('');
	const [error, setError] = useState('');

	const runStorageRoundtrip = async () => {
		try {
			setError('');
			const key = await generateAesKey();
			const storage = new SecureLocalStorage({
				encryptionKey: key,
				prefix: 'e2e-test:',
			});

			storage.clear();

			const secret = 'Stored secret value';
			await storage.setItem('test-item', secret);
			setStoreResult('stored');

			const retrieved = await storage.getItem('test-item');
			setRetrieveResult(retrieved ?? '');

			const rawValue = localStorage.getItem('e2e-test:test-item');
			if (rawValue === secret) {
				setError('Value was stored in plaintext!');
			}

			storage.clear();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	return (
		<div data-testid="storage-container">
			<h2>Storage Tests</h2>
			<button
				data-testid="storage-run-roundtrip"
				onClick={runStorageRoundtrip}
			>
				Run Storage Roundtrip
			</button>
			<div data-testid="storage-store-result">{storeResult}</div>
			<div data-testid="storage-retrieve-result">{retrieveResult}</div>
			{error && <div data-testid="storage-error">{error}</div>}
		</div>
	);
};
