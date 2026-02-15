import { describe, it, expect } from 'vitest';
import {
	aesEncrypt,
	aesDecrypt,
	aesEncryptWithPassword,
	aesDecryptWithPassword,
} from './aes';
import { generateAesKey } from '../keys/keys';
import { DecryptionError } from '../errors';

describe('AES-GCM', () => {
	it('should encrypt and decrypt a string roundtrip', async () => {
		const key = await generateAesKey();
		const plaintext = 'Hello, KhashVault!';
		const encrypted = await aesEncrypt(key, plaintext);

		expect(encrypted.ciphertext).toBeDefined();
		expect(encrypted.iv).toBeDefined();
		expect(encrypted.ciphertext).not.toBe(plaintext);

		const decrypted = await aesDecrypt(key, encrypted);
		expect(decrypted).toBe(plaintext);
	});

	it('should fail decryption with a wrong key', async () => {
		const key1 = await generateAesKey();
		const key2 = await generateAesKey();
		const encrypted = await aesEncrypt(key1, 'secret');

		await expect(aesDecrypt(key2, encrypted)).rejects.toThrow(
			DecryptionError,
		);
	});

	it('should handle empty string', async () => {
		const key = await generateAesKey();
		const encrypted = await aesEncrypt(key, '');
		const decrypted = await aesDecrypt(key, encrypted);
		expect(decrypted).toBe('');
	});

	it('should handle unicode content', async () => {
		const key = await generateAesKey();
		const plaintext = 'Hello 🌍 World! Привет мир! 你好世界';
		const encrypted = await aesEncrypt(key, plaintext);
		const decrypted = await aesDecrypt(key, encrypted);
		expect(decrypted).toBe(plaintext);
	});

	it('should produce different ciphertexts for same plaintext (random IV)', async () => {
		const key = await generateAesKey();
		const plaintext = 'same message';
		const a = await aesEncrypt(key, plaintext);
		const b = await aesEncrypt(key, plaintext);
		expect(a.ciphertext).not.toBe(b.ciphertext);
		expect(a.iv).not.toBe(b.iv);
	});
});

describe('AES-GCM with password', () => {
	it('should encrypt and decrypt with a password', async () => {
		const password = 'my-secure-password';
		const plaintext = 'Secret data to protect';

		const encrypted = await aesEncryptWithPassword(password, plaintext);
		expect(encrypted.ciphertext).toBeDefined();
		expect(encrypted.iv).toBeDefined();
		expect(encrypted.salt).toBeDefined();
		expect(encrypted.iterations).toBeGreaterThan(0);

		const decrypted = await aesDecryptWithPassword(password, encrypted);
		expect(decrypted).toBe(plaintext);
	});

	it('should fail with wrong password', async () => {
		const encrypted = await aesEncryptWithPassword(
			'correct-password',
			'secret',
		);

		await expect(
			aesDecryptWithPassword('wrong-password', encrypted),
		).rejects.toThrow();
	});
});
