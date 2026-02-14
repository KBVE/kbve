import { CryptoNotAvailableError } from './errors';

/**
 * Returns the SubtleCrypto instance, or throws if unavailable.
 */
export function getSubtle(): SubtleCrypto {
	if (typeof globalThis.crypto?.subtle === 'undefined') {
		throw new CryptoNotAvailableError();
	}
	return globalThis.crypto.subtle;
}

/**
 * Returns the global crypto object for random values.
 */
export function getCrypto(): Crypto {
	if (typeof globalThis.crypto === 'undefined') {
		throw new CryptoNotAvailableError();
	}
	return globalThis.crypto;
}

/**
 * Encode a Uint8Array to a base64 string.
 */
export function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/**
 * Decode a base64 string to a Uint8Array.
 */
export function fromBase64(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

/**
 * Encode a Uint8Array to a hex string.
 */
export function toHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Encode a string to a Uint8Array via TextEncoder.
 */
export function encode(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

/**
 * Decode a Uint8Array to a string via TextDecoder.
 */
export function decode(bytes: Uint8Array | ArrayBuffer): string {
	return new TextDecoder().decode(bytes);
}
