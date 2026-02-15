import { describe, it, expect } from 'vitest';
import { hash, hashBytes, sha256, sha512 } from './hash';

describe('Hashing', () => {
	it('should hash a string with SHA-256', async () => {
		const result = await hash('hello', 'SHA-256');
		expect(result.hex).toBe(
			'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
		);
		expect(result.raw).toBeInstanceOf(ArrayBuffer);
		expect(result.raw.byteLength).toBe(32);
	});

	it('should hash a string with SHA-512', async () => {
		const result = await hash('hello', 'SHA-512');
		expect(result.hex).toMatch(/^[0-9a-f]{128}$/);
		expect(result.raw.byteLength).toBe(64);
	});

	it('should hash empty string', async () => {
		const result = await sha256('');
		expect(result).toBe(
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
		);
	});

	it('should hash bytes', async () => {
		const data = new TextEncoder().encode('hello');
		const result = await hashBytes(data, 'SHA-256');
		expect(result.hex).toBe(
			'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
		);
	});

	it('sha256 convenience should return hex string', async () => {
		const hex = await sha256('test');
		expect(hex).toMatch(/^[0-9a-f]{64}$/);
	});

	it('sha512 convenience should return hex string', async () => {
		const hex = await sha512('test');
		expect(hex).toMatch(/^[0-9a-f]{128}$/);
	});

	it('should produce consistent results', async () => {
		const a = await sha256('deterministic');
		const b = await sha256('deterministic');
		expect(a).toBe(b);
	});
});
