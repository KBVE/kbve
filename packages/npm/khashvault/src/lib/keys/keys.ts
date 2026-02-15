import type { KeyFormat, ExportedKey } from '../types';
import { KeyManagementError } from '../errors';
import { getSubtle, getCrypto, toBase64, fromBase64 } from '../utils';

/**
 * Generate a new AES-GCM CryptoKey.
 */
export async function generateAesKey(
	length: 128 | 192 | 256 = 256,
	extractable = true,
): Promise<CryptoKey> {
	try {
		const subtle = getSubtle();
		return await subtle.generateKey(
			{ name: 'AES-GCM', length },
			extractable,
			['encrypt', 'decrypt'],
		);
	} catch (err) {
		if (err instanceof KeyManagementError) throw err;
		throw new KeyManagementError(
			`AES key generation failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Export a CryptoKey to a portable format.
 */
export async function exportKey(
	key: CryptoKey,
	format: KeyFormat = 'raw',
): Promise<ExportedKey> {
	try {
		const subtle = getSubtle();
		if (format === 'jwk') {
			const jwk = await subtle.exportKey('jwk', key);
			return { format: 'jwk', data: jwk };
		}
		const raw = await subtle.exportKey('raw', key);
		return { format: 'raw', data: toBase64(new Uint8Array(raw)) };
	} catch (err) {
		if (err instanceof KeyManagementError) throw err;
		throw new KeyManagementError(
			`Key export failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Import a CryptoKey from a portable format.
 */
export async function importKey(
	exported: ExportedKey,
	extractable = true,
): Promise<CryptoKey> {
	try {
		const subtle = getSubtle();
		if (exported.format === 'jwk') {
			return await subtle.importKey(
				'jwk',
				exported.data as JsonWebKey,
				{ name: 'AES-GCM' },
				extractable,
				['encrypt', 'decrypt'],
			);
		}
		const raw = fromBase64(exported.data as string);
		return await subtle.importKey(
			'raw',
			raw,
			{ name: 'AES-GCM' },
			extractable,
			['encrypt', 'decrypt'],
		);
	} catch (err) {
		if (err instanceof KeyManagementError) throw err;
		throw new KeyManagementError(
			`Key import failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Generate a random byte array (for salts, IVs, nonces).
 */
export function randomBytes(length: number): Uint8Array {
	return getCrypto().getRandomValues(new Uint8Array(length));
}
