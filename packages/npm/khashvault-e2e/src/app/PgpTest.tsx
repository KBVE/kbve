import React, { useState } from 'react';
import { pgpGenerateKeyPair, pgpEncrypt, pgpDecrypt } from '@kbve/khashvault';

export const PgpTest: React.FC = () => {
	const [keyGenerated, setKeyGenerated] = useState(false);
	const [roundtripResult, setRoundtripResult] = useState('');
	const [error, setError] = useState('');

	const runPgpRoundtrip = async () => {
		try {
			setError('');
			const keyPair = await pgpGenerateKeyPair({
				name: 'E2E Test User',
				email: 'e2e@test.local',
				type: 'ecc',
			});
			setKeyGenerated(true);

			const plaintext = 'PGP E2E test message';
			const encrypted = await pgpEncrypt(plaintext, [keyPair.publicKey]);
			const decrypted = await pgpDecrypt(
				encrypted.armoredMessage,
				keyPair.privateKey,
			);
			setRoundtripResult(decrypted.plaintext);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	return (
		<div data-testid="pgp-container">
			<h2>PGP Tests</h2>
			<button data-testid="pgp-run-roundtrip" onClick={runPgpRoundtrip}>
				Run PGP Roundtrip
			</button>
			{keyGenerated && (
				<div data-testid="pgp-key-generated">Key Generated</div>
			)}
			<div data-testid="pgp-roundtrip-result">{roundtripResult}</div>
			{error && <div data-testid="pgp-error">{error}</div>}
		</div>
	);
};
