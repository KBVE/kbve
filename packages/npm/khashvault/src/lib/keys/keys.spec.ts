import { describe, it, expect } from 'vitest';
import { generateAesKey, exportKey, importKey, randomBytes } from './keys';

describe('Key Management', () => {
	it('should generate a 256-bit AES key', async () => {
		const key = await generateAesKey(256);
		expect(key).toBeDefined();
		expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
		expect(key.extractable).toBe(true);
		expect(key.usages).toContain('encrypt');
		expect(key.usages).toContain('decrypt');
	});

	it('should generate a 128-bit AES key', async () => {
		const key = await generateAesKey(128);
		expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 128 });
	});

	it('should export and import a key in raw format', async () => {
		const key = await generateAesKey();
		const exported = await exportKey(key, 'raw');

		expect(exported.format).toBe('raw');
		expect(typeof exported.data).toBe('string');

		const imported = await importKey(exported);
		expect(imported.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
	});

	it('should export and import a key in JWK format', async () => {
		const key = await generateAesKey();
		const exported = await exportKey(key, 'jwk');

		expect(exported.format).toBe('jwk');
		expect(typeof exported.data).toBe('object');

		const imported = await importKey(exported);
		expect(imported.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
	});

	it('should generate random bytes of correct length', () => {
		const bytes16 = randomBytes(16);
		expect(bytes16).toBeInstanceOf(Uint8Array);
		expect(bytes16.byteLength).toBe(16);

		const bytes32 = randomBytes(32);
		expect(bytes32.byteLength).toBe(32);
	});

	it('should generate different random bytes each time', () => {
		const a = randomBytes(32);
		const b = randomBytes(32);
		expect(a).not.toEqual(b);
	});
});
