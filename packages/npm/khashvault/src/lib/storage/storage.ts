import type { SecureStorageOptions } from '../types';
import { StorageError } from '../errors';
import { aesEncrypt, aesDecrypt } from '../aes/aes';

/**
 * Encrypted wrapper around localStorage.
 * All values are AES-GCM encrypted before being stored.
 */
export class SecureLocalStorage {
	private key: CryptoKey;
	private prefix: string;

	constructor(options: SecureStorageOptions) {
		this.key = options.encryptionKey;
		this.prefix = options.prefix ?? 'khashvault:';
	}

	async setItem(name: string, value: string): Promise<void> {
		try {
			const encrypted = await aesEncrypt(this.key, value);
			const payload = JSON.stringify(encrypted);
			localStorage.setItem(this.prefix + name, payload);
		} catch (err) {
			if (err instanceof StorageError) throw err;
			throw new StorageError(
				`Failed to set item '${name}': ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async getItem(name: string): Promise<string | null> {
		try {
			const raw = localStorage.getItem(this.prefix + name);
			if (raw === null) return null;
			const { ciphertext, iv } = JSON.parse(raw);
			return await aesDecrypt(this.key, { ciphertext, iv });
		} catch (err) {
			if (err instanceof StorageError) throw err;
			throw new StorageError(
				`Failed to get item '${name}': ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	removeItem(name: string): void {
		localStorage.removeItem(this.prefix + name);
	}

	clear(): void {
		const keysToRemove: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key?.startsWith(this.prefix)) {
				keysToRemove.push(key);
			}
		}
		keysToRemove.forEach((key) => localStorage.removeItem(key));
	}

	hasItem(name: string): boolean {
		return localStorage.getItem(this.prefix + name) !== null;
	}

	keys(): string[] {
		const result: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key?.startsWith(this.prefix)) {
				result.push(key.slice(this.prefix.length));
			}
		}
		return result;
	}
}
