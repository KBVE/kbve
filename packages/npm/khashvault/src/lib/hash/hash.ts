import type { HashAlgorithm, HashResult } from '../types';
import { HashError } from '../errors';
import { getSubtle, toHex, encode } from '../utils';

/**
 * Hash a string using the specified algorithm.
 */
export async function hash(
	data: string,
	algorithm: HashAlgorithm = 'SHA-256',
): Promise<HashResult> {
	try {
		const subtle = getSubtle();
		const encoded = encode(data);
		const raw = await subtle.digest(algorithm, encoded);
		return {
			hex: toHex(new Uint8Array(raw)),
			raw,
		};
	} catch (err) {
		if (err instanceof HashError) throw err;
		throw new HashError(
			`Hashing with ${algorithm} failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Hash raw bytes.
 */
export async function hashBytes(
	data: Uint8Array<ArrayBuffer> | ArrayBuffer,
	algorithm: HashAlgorithm = 'SHA-256',
): Promise<HashResult> {
	try {
		const subtle = getSubtle();
		const raw = await subtle.digest(algorithm, data);
		return {
			hex: toHex(new Uint8Array(raw)),
			raw,
		};
	} catch (err) {
		if (err instanceof HashError) throw err;
		throw new HashError(
			`Hashing bytes with ${algorithm} failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Convenience: SHA-256 hash of a string, returning hex.
 */
export async function sha256(data: string): Promise<string> {
	const result = await hash(data, 'SHA-256');
	return result.hex;
}

/**
 * Convenience: SHA-512 hash of a string, returning hex.
 */
export async function sha512(data: string): Promise<string> {
	const result = await hash(data, 'SHA-512');
	return result.hex;
}
