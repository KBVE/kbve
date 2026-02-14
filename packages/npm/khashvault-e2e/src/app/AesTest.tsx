import React, { useState } from 'react';
import {
	generateAesKey,
	aesEncrypt,
	aesDecrypt,
	aesEncryptWithPassword,
	aesDecryptWithPassword,
} from '@kbve/khashvault';

export const AesTest: React.FC = () => {
	const [keyGenerated, setKeyGenerated] = useState(false);
	const [roundtripResult, setRoundtripResult] = useState('');
	const [passwordResult, setPasswordResult] = useState('');
	const [error, setError] = useState('');

	const runKeyRoundtrip = async () => {
		try {
			setError('');
			const key = await generateAesKey();
			setKeyGenerated(true);

			const plaintext = 'KhashVault E2E test message';
			const encrypted = await aesEncrypt(key, plaintext);
			const decrypted = await aesDecrypt(key, encrypted);
			setRoundtripResult(decrypted);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	const runPasswordRoundtrip = async () => {
		try {
			setError('');
			const password = 'e2e-test-password';
			const plaintext = 'Password-encrypted secret';
			const encrypted = await aesEncryptWithPassword(
				password,
				plaintext,
				1000,
			);
			const decrypted = await aesDecryptWithPassword(password, encrypted);
			setPasswordResult(decrypted);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	return (
		<div data-testid="aes-container">
			<h2>AES Tests</h2>
			<button data-testid="aes-run-roundtrip" onClick={runKeyRoundtrip}>
				Run Key Roundtrip
			</button>
			<button
				data-testid="aes-run-password"
				onClick={runPasswordRoundtrip}
			>
				Run Password Roundtrip
			</button>
			{keyGenerated && (
				<div data-testid="aes-key-generated">Key Generated</div>
			)}
			<div data-testid="aes-roundtrip-result">{roundtripResult}</div>
			<div data-testid="aes-password-result">{passwordResult}</div>
			{error && <div data-testid="aes-error">{error}</div>}
		</div>
	);
};
