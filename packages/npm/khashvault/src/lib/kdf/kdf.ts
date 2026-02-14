import type { Pbkdf2Options, DerivedKeyResult } from '../types';
import { KeyDerivationError } from '../errors';
import { getSubtle, getCrypto, encode } from '../utils';

const DEFAULT_ITERATIONS = 600_000;
const DEFAULT_KEY_LENGTH = 256;
const DEFAULT_HASH = 'SHA-256' as const;

/**
 * Derive a CryptoKey from a password using PBKDF2.
 */
export async function deriveKey(
	options: Pbkdf2Options,
): Promise<DerivedKeyResult> {
	try {
		const subtle = getSubtle();
		const salt =
			options.salt ??
			getCrypto().getRandomValues(new Uint8Array(16));
		const iterations = options.iterations ?? DEFAULT_ITERATIONS;
		const hashAlgo = options.hash ?? DEFAULT_HASH;
		const keyLength = options.keyLength ?? DEFAULT_KEY_LENGTH;

		const passwordKey = await subtle.importKey(
			'raw',
			encode(options.password),
			'PBKDF2',
			false,
			['deriveKey'],
		);

		const derivedKey = await subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt,
				iterations,
				hash: hashAlgo,
			},
			passwordKey,
			{ name: 'AES-GCM', length: keyLength },
			true,
			['encrypt', 'decrypt'],
		);

		return { key: derivedKey, salt, iterations };
	} catch (err) {
		if (err instanceof KeyDerivationError) throw err;
		throw new KeyDerivationError(
			`PBKDF2 key derivation failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Derive raw key material (ArrayBuffer) instead of a CryptoKey.
 */
export async function deriveRawBits(
	options: Pbkdf2Options,
): Promise<{ bits: ArrayBuffer; salt: Uint8Array; iterations: number }> {
	try {
		const subtle = getSubtle();
		const salt =
			options.salt ??
			getCrypto().getRandomValues(new Uint8Array(16));
		const iterations = options.iterations ?? DEFAULT_ITERATIONS;
		const hashAlgo = options.hash ?? DEFAULT_HASH;
		const keyLength = options.keyLength ?? DEFAULT_KEY_LENGTH;

		const passwordKey = await subtle.importKey(
			'raw',
			encode(options.password),
			'PBKDF2',
			false,
			['deriveBits'],
		);

		const bits = await subtle.deriveBits(
			{ name: 'PBKDF2', salt, iterations, hash: hashAlgo },
			passwordKey,
			keyLength,
		);

		return { bits, salt, iterations };
	} catch (err) {
		if (err instanceof KeyDerivationError) throw err;
		throw new KeyDerivationError(
			`PBKDF2 bit derivation failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}
