// Types
export type {
	BinaryEncoding,
	AesEncryptResult,
	AesEncryptOptions,
	AesDecryptOptions,
	AesPasswordResult,
	HashAlgorithm,
	HashResult,
	Pbkdf2Options,
	DerivedKeyResult,
	KeyFormat,
	ExportedKey,
	PgpKeyPair,
	PgpEncryptResult,
	PgpDecryptResult,
	PgpKeyGenOptions,
	SecureStorageOptions,
	SecureIDBOptions,
} from './lib/types';

// Errors
export {
	KhashVaultError,
	CryptoNotAvailableError,
	EncryptionError,
	DecryptionError,
	KeyDerivationError,
	KeyManagementError,
	HashError,
	PgpError,
	StorageError,
} from './lib/errors';

// AES
export {
	aesEncrypt,
	aesDecrypt,
	aesEncryptWithPassword,
	aesDecryptWithPassword,
} from './lib/aes/aes';

// Hashing
export { hash, hashBytes, sha256, sha512 } from './lib/hash/hash';

// Key Derivation
export { deriveKey, deriveRawBits } from './lib/kdf/kdf';

// Key Management
export {
	generateAesKey,
	exportKey,
	importKey,
	randomBytes,
} from './lib/keys/keys';

// PGP
export {
	pgpGenerateKeyPair,
	pgpEncrypt,
	pgpDecrypt,
} from './lib/pgp/pgp';

// Secure Storage
export { SecureLocalStorage } from './lib/storage/storage';
export { SecureIndexedDB } from './lib/storage/indexeddb';

// Worker
export { KhashVaultWorkerClient } from './lib/worker/worker-client';
export type { WorkerClientOptions } from './lib/worker/worker-client';
export {
	isSharedArrayBufferAvailable,
	isCrossOriginIsolated,
	encodeToSharedBuffer,
	decodeFromSharedBuffer,
	toSharedArrayBuffer,
} from './lib/worker/shared-buffer';
