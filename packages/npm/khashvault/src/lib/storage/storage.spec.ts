import { describe, it, expect, beforeEach } from 'vitest';
import { SecureLocalStorage } from './storage';
import { generateAesKey } from '../keys/keys';

describe('SecureLocalStorage', () => {
	let store: SecureLocalStorage;

	beforeEach(async () => {
		localStorage.clear();
		const key = await generateAesKey();
		store = new SecureLocalStorage({ encryptionKey: key });
	});

	it('should set and get an item', async () => {
		await store.setItem('greeting', 'hello world');
		const value = await store.getItem('greeting');
		expect(value).toBe('hello world');
	});

	it('should return null for non-existent key', async () => {
		const value = await store.getItem('missing');
		expect(value).toBeNull();
	});

	it('should store encrypted data in localStorage', async () => {
		await store.setItem('secret', 'plaintext-value');
		const raw = localStorage.getItem('khashvault:secret');
		expect(raw).not.toBeNull();
		expect(raw).not.toContain('plaintext-value');
	});

	it('should remove an item', async () => {
		await store.setItem('temp', 'value');
		expect(store.hasItem('temp')).toBe(true);
		store.removeItem('temp');
		expect(store.hasItem('temp')).toBe(false);
	});

	it('should clear all items with prefix', async () => {
		await store.setItem('a', '1');
		await store.setItem('b', '2');
		localStorage.setItem('other-key', 'should-remain');

		store.clear();

		expect(store.hasItem('a')).toBe(false);
		expect(store.hasItem('b')).toBe(false);
		expect(localStorage.getItem('other-key')).toBe('should-remain');
	});

	it('should list keys', async () => {
		await store.setItem('x', '1');
		await store.setItem('y', '2');
		const keys = store.keys();
		expect(keys).toContain('x');
		expect(keys).toContain('y');
		expect(keys).toHaveLength(2);
	});

	it('should support custom prefix', async () => {
		const key = await generateAesKey();
		const custom = new SecureLocalStorage({
			encryptionKey: key,
			prefix: 'myapp:',
		});
		await custom.setItem('test', 'value');
		expect(localStorage.getItem('myapp:test')).not.toBeNull();
	});
});
