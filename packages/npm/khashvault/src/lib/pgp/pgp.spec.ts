import { describe, it, expect } from 'vitest';
import { pgpGenerateKeyPair, pgpEncrypt, pgpDecrypt } from './pgp';
import { PgpError } from '../errors';

describe('PGP', () => {
	it('should generate an ECC key pair', async () => {
		const keyPair = await pgpGenerateKeyPair({
			name: 'Test User',
			email: 'test@example.com',
		});

		expect(keyPair.publicKey).toContain('-----BEGIN PGP PUBLIC KEY BLOCK-----');
		expect(keyPair.privateKey).toContain('-----BEGIN PGP PRIVATE KEY BLOCK-----');
		expect(keyPair.revocationCertificate).toBeDefined();
	}, 30000);

	it('should encrypt and decrypt a message', async () => {
		const keyPair = await pgpGenerateKeyPair({
			name: 'Test User',
			email: 'test@example.com',
		});

		const plaintext = 'Secret PGP message';
		const encrypted = await pgpEncrypt(plaintext, [keyPair.publicKey]);

		expect(encrypted.armoredMessage).toContain('-----BEGIN PGP MESSAGE-----');

		const decrypted = await pgpDecrypt(
			encrypted.armoredMessage,
			keyPair.privateKey,
		);
		expect(decrypted.plaintext).toBe(plaintext);
	}, 30000);

	it('should encrypt and decrypt with passphrase-protected key', async () => {
		const passphrase = 'my-secure-passphrase';
		const keyPair = await pgpGenerateKeyPair({
			name: 'Protected User',
			email: 'protected@example.com',
			passphrase,
		});

		const plaintext = 'Passphrase-protected secret';
		const encrypted = await pgpEncrypt(plaintext, [keyPair.publicKey]);

		const decrypted = await pgpDecrypt(
			encrypted.armoredMessage,
			keyPair.privateKey,
			passphrase,
		);
		expect(decrypted.plaintext).toBe(plaintext);
	}, 30000);

	it('should fail decryption with wrong private key', async () => {
		const keyPairA = await pgpGenerateKeyPair({
			name: 'User A',
			email: 'a@example.com',
		});
		const keyPairB = await pgpGenerateKeyPair({
			name: 'User B',
			email: 'b@example.com',
		});

		const encrypted = await pgpEncrypt('secret', [keyPairA.publicKey]);

		await expect(
			pgpDecrypt(encrypted.armoredMessage, keyPairB.privateKey),
		).rejects.toThrow(PgpError);
	}, 30000);
});
