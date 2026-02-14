import * as openpgp from 'openpgp';
import type {
	PgpKeyPair,
	PgpEncryptResult,
	PgpDecryptResult,
	PgpKeyGenOptions,
} from '../types';
import { PgpError } from '../errors';

/**
 * Generate a new PGP key pair.
 */
export async function pgpGenerateKeyPair(
	options: PgpKeyGenOptions,
): Promise<PgpKeyPair> {
	try {
		const { privateKey, publicKey, revocationCertificate } =
			await openpgp.generateKey({
				type: options.type === 'rsa' ? 'rsa' : 'ecc',
				rsaBits: options.type === 'rsa' ? (options.rsaBits ?? 4096) : undefined,
				curve:
					options.type === 'rsa'
						? undefined
						: ((options.curve ?? 'curve25519') as openpgp.EllipticCurveName),
				userIDs: [{ name: options.name, email: options.email }],
				passphrase: options.passphrase ?? '',
				format: 'armored',
			});

		return { publicKey, privateKey, revocationCertificate };
	} catch (err) {
		if (err instanceof PgpError) throw err;
		throw new PgpError(
			`PGP key generation failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Encrypt a message with one or more PGP public keys.
 */
export async function pgpEncrypt(
	plaintext: string,
	armoredPublicKeys: string[],
): Promise<PgpEncryptResult> {
	try {
		const publicKeys = await Promise.all(
			armoredPublicKeys.map((k) => openpgp.readKey({ armoredKey: k })),
		);

		const armoredMessage = await openpgp.encrypt({
			message: await openpgp.createMessage({ text: plaintext }),
			encryptionKeys: publicKeys,
		});

		return { armoredMessage: armoredMessage as string };
	} catch (err) {
		if (err instanceof PgpError) throw err;
		throw new PgpError(
			`PGP encryption failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Decrypt a PGP message with a private key.
 */
export async function pgpDecrypt(
	armoredMessage: string,
	armoredPrivateKey: string,
	passphrase?: string,
): Promise<PgpDecryptResult> {
	try {
		let privateKey = await openpgp.readPrivateKey({
			armoredKey: armoredPrivateKey,
		});

		if (passphrase) {
			privateKey = await openpgp.decryptKey({
				privateKey,
				passphrase,
			});
		}

		const message = await openpgp.readMessage({ armoredMessage });
		const { data: plaintext } = await openpgp.decrypt({
			message,
			decryptionKeys: privateKey,
		});

		return { plaintext: plaintext as string };
	} catch (err) {
		if (err instanceof PgpError) throw err;
		throw new PgpError(
			`PGP decryption failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}
