import type {
	AesEncryptResult,
	AesEncryptOptions,
	AesDecryptOptions,
	AesPasswordResult,
} from '../types';
import { EncryptionError, DecryptionError } from '../errors';
import { getSubtle, getCrypto, toBase64, fromBase64, encode } from '../utils';
import { deriveKey } from '../kdf/kdf';

/**
 * Encrypt plaintext with AES-GCM.
 */
export async function aesEncrypt(
	key: CryptoKey,
	plaintext: string,
	options?: AesEncryptOptions,
): Promise<AesEncryptResult> {
	try {
		const subtle = getSubtle();
		const iv =
			options?.iv ??
			getCrypto().getRandomValues(new Uint8Array(12));
		const encoded = encode(plaintext);

		const ciphertextBuffer = await subtle.encrypt(
			{ name: 'AES-GCM', iv },
			key,
			encoded,
		);

		return {
			ciphertext: toBase64(new Uint8Array(ciphertextBuffer)),
			iv: toBase64(iv),
		};
	} catch (err) {
		if (err instanceof EncryptionError) throw err;
		throw new EncryptionError(
			`AES-GCM encryption failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Decrypt AES-GCM ciphertext.
 */
export async function aesDecrypt(
	key: CryptoKey,
	data: AesDecryptOptions,
): Promise<string> {
	try {
		const subtle = getSubtle();
		const iv = fromBase64(data.iv);
		const ciphertext = fromBase64(data.ciphertext);

		const plaintextBuffer = await subtle.decrypt(
			{ name: 'AES-GCM', iv },
			key,
			ciphertext,
		);

		return new TextDecoder().decode(plaintextBuffer);
	} catch (err) {
		if (err instanceof DecryptionError) throw err;
		throw new DecryptionError(
			`AES-GCM decryption failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * High-level convenience: encrypt a string with a password.
 * Internally derives a key with PBKDF2, then encrypts with AES-GCM.
 */
export async function aesEncryptWithPassword(
	password: string,
	plaintext: string,
	iterations?: number,
): Promise<AesPasswordResult> {
	const derived = await deriveKey({
		password,
		iterations,
	});
	const encrypted = await aesEncrypt(derived.key, plaintext);

	return {
		ciphertext: encrypted.ciphertext,
		iv: encrypted.iv,
		salt: toBase64(derived.salt),
		iterations: derived.iterations,
	};
}

/**
 * High-level convenience: decrypt with a password.
 */
export async function aesDecryptWithPassword(
	password: string,
	data: AesPasswordResult,
): Promise<string> {
	const salt = fromBase64(data.salt);
	const derived = await deriveKey({
		password,
		salt,
		iterations: data.iterations,
	});

	return aesDecrypt(derived.key, {
		ciphertext: data.ciphertext,
		iv: data.iv,
	});
}
