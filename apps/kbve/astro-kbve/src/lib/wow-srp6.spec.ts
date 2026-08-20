import { describe, expect, it } from 'vitest';
import { buildCredential, deriveVerifier, randomSalt } from './wow-srp6';

/**
 * Known-good vector from an AzerothCore acore_auth.account row (the ADMIN
 * account seeded by ToCloud9's own SQL). If this stops matching, the byte
 * order is wrong and every account we provision would be unloggable — the
 * failure is silent at write time and only shows up as a rejected login.
 */
const KNOWN = {
	username: 'ADMIN',
	password: 'ADMIN',
	salt: '9140667E6B813C4057EB9ED0265FD5349A4DD0CDEF726887F848DE9F84629C91',
	verifier:
		'3C3887BAE646B9F53D26EF8BA800546C32DE2D397575F31A791A56AEB5685638',
};

function hexToBytes(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

function toHexUpper(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
		.toUpperCase();
}

describe('wow-srp6', () => {
	it('reproduces a real AzerothCore verifier', async () => {
		const verifier = await deriveVerifier(
			KNOWN.username,
			KNOWN.password,
			hexToBytes(KNOWN.salt),
		);
		expect(toHexUpper(verifier)).toBe(KNOWN.verifier);
	});

	it('treats credentials as case-insensitive, matching the 3.3.5a client', async () => {
		const salt = hexToBytes(KNOWN.salt);
		const upper = await deriveVerifier('ADMIN', 'ADMIN', salt);
		const lower = await deriveVerifier('admin', 'admin', salt);
		const mixed = await deriveVerifier('AdMiN', 'aDmIn', salt);
		expect(toHexUpper(lower)).toBe(toHexUpper(upper));
		expect(toHexUpper(mixed)).toBe(toHexUpper(upper));
	});

	it('produces a different verifier for a different password', async () => {
		const salt = hexToBytes(KNOWN.salt);
		const other = await deriveVerifier(
			KNOWN.username,
			'not-the-password',
			salt,
		);
		expect(toHexUpper(other)).not.toBe(KNOWN.verifier);
	});

	it('salts each credential independently', async () => {
		const a = await buildCredential('someone', 'hunter2');
		const b = await buildCredential('someone', 'hunter2');
		expect(a.salt).not.toBe(b.salt);
		expect(a.verifier).not.toBe(b.verifier);
	});

	it('emits 64 uppercase hex chars for both fields', async () => {
		const { salt, verifier } = await buildCredential('someone', 'hunter2');
		expect(salt).toMatch(/^[0-9A-F]{64}$/);
		expect(verifier).toMatch(/^[0-9A-F]{64}$/);
	});

	it('generates 32 bytes of salt', () => {
		expect(randomSalt()).toHaveLength(32);
	});
});
