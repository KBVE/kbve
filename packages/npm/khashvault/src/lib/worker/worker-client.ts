/**
 * Main-thread client that dispatches crypto operations to a Web Worker.
 *
 * Initialization modes:
 * 1. With droid (useDroid: true) — loads as a droid module via window.kbve.mod.load()
 * 2. Standalone (workerUrl provided) — spawns its own dedicated Worker
 * 3. Fallback — if Workers are unavailable, calls core functions directly on main thread
 */
import type { Remote } from 'comlink';
import type { KhashVaultWorkerAPI } from './khashvault-worker';
import type {
	ExportedKey,
	AesEncryptResult,
	AesDecryptOptions,
	AesPasswordResult,
	HashAlgorithm,
	PgpKeyGenOptions,
	PgpKeyPair,
	PgpEncryptResult,
	PgpDecryptResult,
	Pbkdf2Options,
} from '../types';
import { encodeToSharedBuffer } from './shared-buffer';

export interface WorkerClientOptions {
	/** Use droid's module system to load the worker. Default: false */
	useDroid?: boolean;
	/** URL to the worker script (for standalone mode). */
	workerUrl?: string;
}

export class KhashVaultWorkerClient {
	private proxy: Remote<KhashVaultWorkerAPI> | null = null;
	private worker: Worker | null = null;
	private initPromise: Promise<void> | null = null;
	private options: WorkerClientOptions;

	constructor(options: WorkerClientOptions = {}) {
		this.options = options;
	}

	/**
	 * Initialize the worker connection. Called lazily on first operation.
	 */
	private async ensureReady(): Promise<Remote<KhashVaultWorkerAPI>> {
		if (this.proxy) return this.proxy;

		if (!this.initPromise) {
			this.initPromise = this.init();
		}
		await this.initPromise;

		if (!this.proxy) {
			throw new Error('KhashVaultWorkerClient: Failed to initialize worker');
		}
		return this.proxy;
	}

	private async init(): Promise<void> {
		const { wrap } = await import('comlink');

		if (this.options.useDroid) {
			await this.initViaDroid(wrap);
		} else if (this.options.workerUrl) {
			this.worker = new Worker(this.options.workerUrl, { type: 'module' });
			this.proxy = wrap<KhashVaultWorkerAPI>(this.worker);
		} else {
			throw new Error(
				'KhashVaultWorkerClient: Provide either useDroid: true or a workerUrl',
			);
		}
	}

	private async initViaDroid(
		wrap: typeof import('comlink').wrap,
	): Promise<void> {
		const kbve = (globalThis as Record<string, unknown>).kbve as
			| { mod?: { load?: (url: string) => Promise<{ instance: Remote<KhashVaultWorkerAPI> }> } }
			| undefined;

		if (!kbve?.mod?.load) {
			throw new Error(
				'KhashVaultWorkerClient: @kbve/droid is not initialized. ' +
				'Ensure droid is loaded before using useDroid mode.',
			);
		}

		const handle = await kbve.mod.load(
			this.options.workerUrl ?? '/workers/khashvault-worker.js',
		);
		this.proxy = handle.instance as Remote<KhashVaultWorkerAPI>;
	}

	// -- AES --

	async aesEncrypt(
		keyData: ExportedKey,
		plaintext: string,
	): Promise<AesEncryptResult> {
		const proxy = await this.ensureReady();
		return proxy.aesEncrypt(keyData, plaintext);
	}

	async aesDecrypt(
		keyData: ExportedKey,
		data: AesDecryptOptions,
	): Promise<string> {
		const proxy = await this.ensureReady();
		return proxy.aesDecrypt(keyData, data);
	}

	async aesEncryptWithPassword(
		password: string,
		plaintext: string,
		iterations?: number,
	): Promise<AesPasswordResult> {
		const proxy = await this.ensureReady();
		return proxy.aesEncryptWithPassword(password, plaintext, iterations);
	}

	async aesDecryptWithPassword(
		password: string,
		data: AesPasswordResult,
	): Promise<string> {
		const proxy = await this.ensureReady();
		return proxy.aesDecryptWithPassword(password, data);
	}

	/**
	 * AES encrypt using SharedArrayBuffer for large payloads (zero-copy).
	 */
	async aesEncryptBuffer(
		keyData: ExportedKey,
		data: string,
	): Promise<AesEncryptResult> {
		const proxy = await this.ensureReady();
		const { buffer, byteLength } = encodeToSharedBuffer(data);
		return proxy.aesEncryptBuffer(keyData, buffer, byteLength);
	}

	// -- Hashing --

	async hash(
		data: string,
		algorithm?: HashAlgorithm,
	): Promise<{ hex: string }> {
		const proxy = await this.ensureReady();
		return proxy.hash(data, algorithm);
	}

	async sha256(data: string): Promise<string> {
		const proxy = await this.ensureReady();
		return proxy.sha256(data);
	}

	async sha512(data: string): Promise<string> {
		const proxy = await this.ensureReady();
		return proxy.sha512(data);
	}

	// -- KDF --

	async deriveKey(
		options: Pbkdf2Options,
	): Promise<{ exportedKey: ExportedKey; salt: string; iterations: number }> {
		const proxy = await this.ensureReady();
		return proxy.deriveKey(options);
	}

	// -- PGP --

	async pgpGenerateKeyPair(
		options: PgpKeyGenOptions,
	): Promise<PgpKeyPair> {
		const proxy = await this.ensureReady();
		return proxy.pgpGenerateKeyPair(options);
	}

	async pgpEncrypt(
		plaintext: string,
		armoredPublicKeys: string[],
	): Promise<PgpEncryptResult> {
		const proxy = await this.ensureReady();
		return proxy.pgpEncrypt(plaintext, armoredPublicKeys);
	}

	async pgpDecrypt(
		armoredMessage: string,
		armoredPrivateKey: string,
		passphrase?: string,
	): Promise<PgpDecryptResult> {
		const proxy = await this.ensureReady();
		return proxy.pgpDecrypt(armoredMessage, armoredPrivateKey, passphrase);
	}

	// -- Lifecycle --

	/**
	 * Terminate the worker. After this, the client cannot be used.
	 */
	terminate(): void {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		this.proxy = null;
		this.initPromise = null;
	}
}
