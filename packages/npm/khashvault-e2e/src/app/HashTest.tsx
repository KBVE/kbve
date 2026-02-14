import React, { useState } from 'react';
import { sha256, sha512 } from '@kbve/khashvault';

export const HashTest: React.FC = () => {
	const [sha256Result, setSha256Result] = useState('');
	const [sha512Result, setSha512Result] = useState('');
	const [error, setError] = useState('');

	const runSha256 = async () => {
		try {
			setError('');
			const result = await sha256('hello');
			setSha256Result(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	const runSha512 = async () => {
		try {
			setError('');
			const result = await sha512('hello');
			setSha512Result(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	return (
		<div data-testid="hash-container">
			<h2>Hash Tests</h2>
			<button data-testid="hash-run-sha256" onClick={runSha256}>
				Run SHA-256
			</button>
			<button data-testid="hash-run-sha512" onClick={runSha512}>
				Run SHA-512
			</button>
			<div data-testid="hash-sha256-result">{sha256Result}</div>
			<div data-testid="hash-sha512-result">{sha512Result}</div>
			{error && <div data-testid="hash-error">{error}</div>}
		</div>
	);
};
