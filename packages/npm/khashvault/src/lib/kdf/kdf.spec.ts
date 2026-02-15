import { describe, it, expect } from 'vitest';
import { deriveKey, deriveRawBits } from './kdf';

describe('PBKDF2 Key Derivation', () => {
	it('should derive a CryptoKey from a password', async () => {
		const result = await deriveKey({ password: 'test-password' });
		expect(result.key).toBeDefined();
		expect(result.key.algorithm).toMatchObject({ name: 'AES-GCM' });
		expect(result.key.usages).toContain('encrypt');
		expect(result.key.usages).toContain('decrypt');
		expect(result.salt).toBeInstanceOf(Uint8Array);
		expect(result.salt.byteLength).toBe(16);
		expect(result.iterations).toBe(600_000);
	});

	it('should produce same key with same password and salt', async () => {
		const salt = new Uint8Array(16);
		globalThis.crypto.getRandomValues(salt);

		const a = await deriveKey({ password: 'same', salt });
		const b = await deriveKey({ password: 'same', salt });

		const subtle = globalThis.crypto.subtle;
		const rawA = await subtle.exportKey('raw', a.key);
		const rawB = await subtle.exportKey('raw', b.key);

		expect(new Uint8Array(rawA)).toEqual(new Uint8Array(rawB));
	});

	it('should produce different keys with different passwords', async () => {
		const salt = new Uint8Array(16);
		globalThis.crypto.getRandomValues(salt);

		const a = await deriveKey({ password: 'password1', salt });
		const b = await deriveKey({ password: 'password2', salt });

		const subtle = globalThis.crypto.subtle;
		const rawA = await subtle.exportKey('raw', a.key);
		const rawB = await subtle.exportKey('raw', b.key);

		expect(new Uint8Array(rawA)).not.toEqual(new Uint8Array(rawB));
	});

	it('should respect custom iterations', async () => {
		const result = await deriveKey({
			password: 'test',
			iterations: 1000,
		});
		expect(result.iterations).toBe(1000);
	});

	it('should derive raw bits', async () => {
		const result = await deriveRawBits({ password: 'test' });
		expect(result.bits).toBeInstanceOf(ArrayBuffer);
		expect(result.bits.byteLength).toBe(32); // 256 bits
		expect(result.salt).toBeInstanceOf(Uint8Array);
		expect(result.iterations).toBe(600_000);
	});
});
