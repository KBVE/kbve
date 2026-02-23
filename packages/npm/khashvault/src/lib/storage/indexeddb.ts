import type { SecureIDBOptions } from '../types';
import { StorageError } from '../errors';
import { aesEncrypt, aesDecrypt } from '../aes/aes';

/**
 * Encrypted wrapper around IndexedDB.
 * Suitable for storing larger payloads than localStorage.
 */
export class SecureIndexedDB {
	private key: CryptoKey;
	private dbName: string;
	private storeName: string;
	private dbPromise: Promise<IDBDatabase> | null = null;

	constructor(options: SecureIDBOptions) {
		this.key = options.encryptionKey;
		this.dbName = options.dbName ?? 'khashvault';
		this.storeName = options.storeName ?? 'vault';
	}

	private open(): Promise<IDBDatabase> {
		if (this.dbPromise) return this.dbPromise;

		this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(this.dbName, 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(this.storeName)) {
					db.createObjectStore(this.storeName);
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () =>
				reject(
					new StorageError(
						`Failed to open IndexedDB '${this.dbName}'`,
					),
				);
		});

		return this.dbPromise;
	}

	async setItem(name: string, value: string): Promise<void> {
		try {
			const db = await this.open();
			const encrypted = await aesEncrypt(this.key, value);
			const payload = JSON.stringify(encrypted);

			return new Promise<void>((resolve, reject) => {
				const tx = db.transaction(this.storeName, 'readwrite');
				tx.objectStore(this.storeName).put(payload, name);
				tx.oncomplete = () => resolve();
				tx.onerror = () =>
					reject(
						new StorageError(
							`Failed to set item '${name}' in IndexedDB`,
						),
					);
			});
		} catch (err) {
			if (err instanceof StorageError) throw err;
			throw new StorageError(
				`IndexedDB setItem failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async getItem(name: string): Promise<string | null> {
		try {
			const db = await this.open();

			return new Promise<string | null>((resolve, reject) => {
				const tx = db.transaction(this.storeName, 'readonly');
				const request = tx.objectStore(this.storeName).get(name);
				request.onsuccess = async () => {
					if (request.result === undefined) {
						resolve(null);
						return;
					}
					try {
						const { ciphertext, iv } = JSON.parse(request.result);
						const decrypted = await aesDecrypt(this.key, {
							ciphertext,
							iv,
						});
						resolve(decrypted);
					} catch (err) {
						reject(
							new StorageError(
								`Failed to decrypt item '${name}': ${err instanceof Error ? err.message : String(err)}`,
							),
						);
					}
				};
				request.onerror = () =>
					reject(
						new StorageError(
							`Failed to get item '${name}' from IndexedDB`,
						),
					);
			});
		} catch (err) {
			if (err instanceof StorageError) throw err;
			throw new StorageError(
				`IndexedDB getItem failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async removeItem(name: string): Promise<void> {
		const db = await this.open();
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction(this.storeName, 'readwrite');
			tx.objectStore(this.storeName).delete(name);
			tx.oncomplete = () => resolve();
			tx.onerror = () =>
				reject(
					new StorageError(
						`Failed to remove item '${name}' from IndexedDB`,
					),
				);
		});
	}

	async clear(): Promise<void> {
		const db = await this.open();
		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction(this.storeName, 'readwrite');
			tx.objectStore(this.storeName).clear();
			tx.oncomplete = () => resolve();
			tx.onerror = () =>
				reject(new StorageError('Failed to clear IndexedDB store'));
		});
	}

	async keys(): Promise<string[]> {
		const db = await this.open();
		return new Promise<string[]>((resolve, reject) => {
			const tx = db.transaction(this.storeName, 'readonly');
			const request = tx.objectStore(this.storeName).getAllKeys();
			request.onsuccess = () => resolve(request.result as string[]);
			request.onerror = () =>
				reject(new StorageError('Failed to list IndexedDB keys'));
		});
	}

	close(): void {
		if (this.dbPromise) {
			this.dbPromise
				.then((db) => db.close())
				.catch(() => {
					/* best-effort */
				});
			this.dbPromise = null;
		}
	}
}
