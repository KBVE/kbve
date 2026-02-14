import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecureIndexedDB } from './indexeddb';
import { generateAesKey } from '../keys/keys';

describe('SecureIndexedDB', () => {
	let store: SecureIndexedDB;

	beforeEach(async () => {
		const key = await generateAesKey();
		store = new SecureIndexedDB({
			encryptionKey: key,
			dbName: `test-${Date.now()}`,
		});
	});

	afterEach(() => {
		store.close();
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

	it('should overwrite existing items', async () => {
		await store.setItem('key', 'first');
		await store.setItem('key', 'second');
		const value = await store.getItem('key');
		expect(value).toBe('second');
	});

	it('should remove an item', async () => {
		await store.setItem('temp', 'value');
		await store.removeItem('temp');
		const value = await store.getItem('temp');
		expect(value).toBeNull();
	});

	it('should clear all items', async () => {
		await store.setItem('a', '1');
		await store.setItem('b', '2');
		await store.clear();
		const keys = await store.keys();
		expect(keys).toHaveLength(0);
	});

	it('should list keys', async () => {
		await store.setItem('x', '1');
		await store.setItem('y', '2');
		const keys = await store.keys();
		expect(keys).toContain('x');
		expect(keys).toContain('y');
		expect(keys).toHaveLength(2);
	});

	it('should handle unicode content', async () => {
		const value = 'Hello 🌍 World! 你好';
		await store.setItem('unicode', value);
		const retrieved = await store.getItem('unicode');
		expect(retrieved).toBe(value);
	});
});
