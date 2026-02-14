// ============================================================
// Encoding
// ============================================================

export type BinaryEncoding = 'base64' | 'hex';

// ============================================================
// AES
// ============================================================

export interface AesEncryptResult {
	/** The ciphertext as a base64-encoded string */
	ciphertext: string;
	/** The 12-byte IV used, base64-encoded */
	iv: string;
}

export interface AesEncryptOptions {
	/** Optional 12-byte IV. If omitted, a random IV is generated. */
	iv?: Uint8Array;
}

export interface AesDecryptOptions {
	/** Base64-encoded ciphertext */
	ciphertext: string;
	/** Base64-encoded IV */
	iv: string;
}

export interface AesPasswordResult {
	/** Base64-encoded ciphertext */
	ciphertext: string;
	/** Base64-encoded IV */
	iv: string;
	/** Base64-encoded salt used for key derivation */
	salt: string;
	/** Number of PBKDF2 iterations used */
	iterations: number;
}

// ============================================================
// Hashing
// ============================================================

export type HashAlgorithm = 'SHA-256' | 'SHA-512';

export interface HashResult {
	/** Hex-encoded hash digest */
	hex: string;
	/** Raw ArrayBuffer */
	raw: ArrayBuffer;
}

// ============================================================
// Key Derivation (PBKDF2)
// ============================================================

export interface Pbkdf2Options {
	/** The password / passphrase */
	password: string;
	/** Salt as Uint8Array. If omitted, a random 16-byte salt is generated. */
	salt?: Uint8Array;
	/** Number of iterations. Default: 600_000 */
	iterations?: number;
	/** Hash function to use. Default: 'SHA-256' */
	hash?: HashAlgorithm;
	/** Derived key length in bits. Default: 256 */
	keyLength?: number;
}

export interface DerivedKeyResult {
	/** The derived CryptoKey, usable with AES-GCM */
	key: CryptoKey;
	/** The salt used (so it can be stored alongside ciphertext) */
	salt: Uint8Array;
	/** Number of iterations used */
	iterations: number;
}

// ============================================================
// Key Management
// ============================================================

export type KeyFormat = 'raw' | 'jwk';

export interface ExportedKey {
	format: KeyFormat;
	/** For 'raw' format: base64 string. For 'jwk' format: JsonWebKey object */
	data: string | JsonWebKey;
}

// ============================================================
// PGP
// ============================================================

export interface PgpKeyPair {
	/** Armored public key */
	publicKey: string;
	/** Armored private key */
	privateKey: string;
	/** Revocation certificate */
	revocationCertificate: string;
}

export interface PgpEncryptResult {
	/** Armored PGP message */
	armoredMessage: string;
}

export interface PgpDecryptResult {
	/** The decrypted plaintext */
	plaintext: string;
}

export interface PgpKeyGenOptions {
	/** User name for the key */
	name: string;
	/** User email for the key */
	email: string;
	/** Optional passphrase to protect the private key */
	passphrase?: string;
	/** Key type. Default: 'ecc' */
	type?: 'ecc' | 'rsa';
	/** RSA bits (only if type is 'rsa'). Default: 4096 */
	rsaBits?: number;
	/** ECC curve (only if type is 'ecc'). Default: 'curve25519' */
	curve?: string;
}

// ============================================================
// Secure Storage
// ============================================================

export interface SecureStorageOptions {
	/** The CryptoKey to use for encryption/decryption */
	encryptionKey: CryptoKey;
	/** Namespace prefix for localStorage keys. Default: 'khashvault:' */
	prefix?: string;
}

export interface SecureIDBOptions {
	/** The CryptoKey to use for encryption/decryption */
	encryptionKey: CryptoKey;
	/** IndexedDB database name. Default: 'khashvault' */
	dbName?: string;
	/** Object store name. Default: 'vault' */
	storeName?: string;
}
