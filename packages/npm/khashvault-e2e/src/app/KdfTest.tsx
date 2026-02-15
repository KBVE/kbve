import React, { useState } from 'react';
import { deriveKey, deriveRawBits } from '@kbve/khashvault';

export const KdfTest: React.FC = () => {
	const [keyDerived, setKeyDerived] = useState(false);
	const [bitsLength, setBitsLength] = useState('');
	const [error, setError] = useState('');

	const runDeriveKey = async () => {
		try {
			setError('');
			const result = await deriveKey({
				password: 'test-password',
				iterations: 1000,
			});
			setKeyDerived(result.key instanceof CryptoKey);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	const runDeriveRawBits = async () => {
		try {
			setError('');
			const result = await deriveRawBits({
				password: 'test-password',
				iterations: 1000,
			});
			setBitsLength(String(result.bits.byteLength));
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	return (
		<div data-testid="kdf-container">
			<h2>KDF Tests</h2>
			<button data-testid="kdf-run-derive" onClick={runDeriveKey}>
				Derive Key
			</button>
			<button data-testid="kdf-run-bits" onClick={runDeriveRawBits}>
				Derive Raw Bits
			</button>
			{keyDerived && (
				<div data-testid="kdf-key-derived">Key Derived</div>
			)}
			<div data-testid="kdf-bits-length">{bitsLength}</div>
			{error && <div data-testid="kdf-error">{error}</div>}
		</div>
	);
};
