/**
 * Droid-compatible Web Worker for offloading crypto operations.
 *
 * Implements droid's BaseModAPI interface and is exposed via comlink.
 * Can be loaded as a droid module: window.kbve.mod.load(workerUrl)
 * Or used standalone as a dedicated Web Worker.
 *
 * CryptoKey objects are non-transferable across worker boundaries,
 * so this worker accepts exported key data (JWK or raw base64)
 * and imports keys internally before performing operations.
 */
import { expose } from 'comlink';
import type {
	ExportedKey,
	AesEncryptResult,
	AesDecryptOptions,
	AesPasswordResult,
	HashAlgorithm,
	HashResult,
	Pbkdf2Options,
	DerivedKeyResult,
	PgpKeyGenOptions,
	PgpKeyPair,
	PgpEncryptResult,
	PgpDecryptResult,
} from '../types';
import { importKey } from '../keys/keys';
import { aesEncrypt, aesDecrypt, aesEncryptWithPassword, aesDecryptWithPassword } from '../aes/aes';
import { hash, hashBytes, sha256, sha512 } from '../hash/hash';
import { deriveKey, deriveRawBits } from '../kdf/kdf';
import { pgpGenerateKeyPair, pgpEncrypt, pgpDecrypt } from '../pgp/pgp';
import { toBase64 } from '../utils';
import { decodeFromSharedBuffer } from './shared-buffer';

const khashvaultWorkerAPI = {
	// -- Droid BaseModAPI --
	async getMeta() {
		return {
			name: 'khashvault',
			version: '0.1.0',
			description: 'Browser-side cryptographic operations worker',
		};
	},

	async init() {
		// No-op — crypto is ready immediately
	},

	// -- AES --
	async aesEncrypt(
		keyData: ExportedKey,
		plaintext: string,
	): Promise<AesEncryptResult> {
		const key = await importKey(keyData, false);
		return aesEncrypt(key, plaintext);
	},

	async aesDecrypt(
		keyData: ExportedKey,
		data: AesDecryptOptions,
	): Promise<string> {
		const key = await importKey(keyData, false);
		return aesDecrypt(key, data);
	},

	async aesEncryptWithPassword(
		password: string,
		plaintext: string,
		iterations?: number,
	): Promise<AesPasswordResult> {
		return aesEncryptWithPassword(password, plaintext, iterations);
	},

	async aesDecryptWithPassword(
		password: string,
		data: AesPasswordResult,
	): Promise<string> {
		return aesDecryptWithPassword(password, data);
	},

	/**
	 * AES encrypt from a SharedArrayBuffer — zero-copy path for large payloads.
	 */
	async aesEncryptBuffer(
		keyData: ExportedKey,
		buffer: SharedArrayBuffer | ArrayBuffer,
		byteLength: number,
	): Promise<AesEncryptResult> {
		const plaintext = decodeFromSharedBuffer(buffer, byteLength);
		const key = await importKey(keyData, false);
		return aesEncrypt(key, plaintext);
	},

	// -- Hashing --
	async hash(
		data: string,
		algorithm?: HashAlgorithm,
	): Promise<{ hex: string }> {
		const result = await hash(data, algorithm);
		return { hex: result.hex };
	},

	async hashBytes(
		buffer: SharedArrayBuffer | ArrayBuffer,
		byteLength: number,
		algorithm?: HashAlgorithm,
	): Promise<{ hex: string }> {
		const view = new Uint8Array(new Uint8Array(buffer, 0, byteLength));
		const result = await hashBytes(view, algorithm);
		return { hex: result.hex };
	},

	async sha256(data: string): Promise<string> {
		return sha256(data);
	},

	async sha512(data: string): Promise<string> {
		return sha512(data);
	},

	// -- KDF --
	async deriveKey(
		options: Pbkdf2Options,
	): Promise<{ exportedKey: ExportedKey; salt: string; iterations: number }> {
		const result = await deriveKey(options);
		const subtle = globalThis.crypto.subtle;
		const rawKey = await subtle.exportKey('raw', result.key);
		return {
			exportedKey: {
				format: 'raw',
				data: toBase64(new Uint8Array(rawKey)),
			},
			salt: toBase64(result.salt),
			iterations: result.iterations,
		};
	},

	async deriveRawBits(
		options: Pbkdf2Options,
	): Promise<{ bits: string; salt: string; iterations: number }> {
		const result = await deriveRawBits(options);
		return {
			bits: toBase64(new Uint8Array(result.bits)),
			salt: toBase64(result.salt),
			iterations: result.iterations,
		};
	},

	// -- PGP --
	async pgpGenerateKeyPair(
		options: PgpKeyGenOptions,
	): Promise<PgpKeyPair> {
		return pgpGenerateKeyPair(options);
	},

	async pgpEncrypt(
		plaintext: string,
		armoredPublicKeys: string[],
	): Promise<PgpEncryptResult> {
		return pgpEncrypt(plaintext, armoredPublicKeys);
	},

	async pgpDecrypt(
		armoredMessage: string,
		armoredPrivateKey: string,
		passphrase?: string,
	): Promise<PgpDecryptResult> {
		return pgpDecrypt(armoredMessage, armoredPrivateKey, passphrase);
	},
};

export type KhashVaultWorkerAPI = typeof khashvaultWorkerAPI;

expose(khashvaultWorkerAPI);
