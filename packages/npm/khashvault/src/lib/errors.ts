export class KhashVaultError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = 'KhashVaultError';
	}
}

export class CryptoNotAvailableError extends KhashVaultError {
	constructor() {
		super(
			'Web Crypto API is not available. Ensure you are running in a secure context (HTTPS).',
			'CRYPTO_NOT_AVAILABLE',
		);
		this.name = 'CryptoNotAvailableError';
	}
}

export class EncryptionError extends KhashVaultError {
	constructor(message: string) {
		super(message, 'ENCRYPTION_ERROR');
		this.name = 'EncryptionError';
	}
}

export class DecryptionError extends KhashVaultError {
	constructor(message: string) {
		super(message, 'DECRYPTION_ERROR');
		this.name = 'DecryptionError';
	}
}

export class KeyDerivationError extends KhashVaultError {
	constructor(message: string) {
		super(message, 'KEY_DERIVATION_ERROR');
		this.name = 'KeyDerivationError';
	}
}

export class KeyManagementError extends KhashVaultError {
	constructor(message: string) {
		super(message, 'KEY_MANAGEMENT_ERROR');
		this.name = 'KeyManagementError';
	}
}

export class HashError extends KhashVaultError {
	constructor(message: string) {
		super(message, 'HASH_ERROR');
		this.name = 'HashError';
	}
}

export class PgpError extends KhashVaultError {
	constructor(message: string) {
		super(message, 'PGP_ERROR');
		this.name = 'PgpError';
	}
}

export class StorageError extends KhashVaultError {
	constructor(message: string) {
		super(message, 'STORAGE_ERROR');
		this.name = 'StorageError';
	}
}
