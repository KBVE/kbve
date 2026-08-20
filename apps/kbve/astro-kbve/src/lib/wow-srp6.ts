/**
 * SRP6 verifier derivation for WoW 3.3.5a / AzerothCore accounts.
 *
 * The point of doing this in the browser is that the plaintext game password
 * never leaves the device. We send only the salt and the verifier, which is
 * exactly what the auth server stores and what it needs to answer a logon
 * challenge — the same trust model the game client itself uses.
 *
 * Byte order is the part that is easy to get wrong and impossible to guess:
 * the salt is used as-is, x is read little-endian from the SHA-1 digest, and
 * the verifier is emitted little-endian. Those three choices were recovered by
 * brute-forcing every combination against a known-good AzerothCore account row
 * until the stored verifier reproduced exactly. `wow-srp6.spec.ts` pins that
 * vector so a future refactor cannot silently break it.
 *
 * SHA-1 is not a free choice here. It is what the 3.3.5a protocol specifies,
 * and the server will reject anything else.
 */

/** SRP6 modulus, fixed by the WoW protocol. */
const N = BigInt(
	'0x894B645E89E1535BBDAD5B8B290650530801B18EBFBF5E8FAB3C82872A3E9BB7',
);

/** SRP6 generator, fixed by the WoW protocol. */
const g = 7n;

const SALT_BYTES = 32;

function toHexUpper(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
		.toUpperCase();
}

function bytesToBigIntLE(bytes: Uint8Array): bigint {
	let out = 0n;
	for (let i = bytes.length - 1; i >= 0; i--) {
		out = (out << 8n) | BigInt(bytes[i]);
	}
	return out;
}

function bigIntToBytesLE(value: bigint, length: number): Uint8Array {
	const out = new Uint8Array(length);
	let v = value;
	for (let i = 0; i < length; i++) {
		out[i] = Number(v & 0xffn);
		v >>= 8n;
	}
	return out;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
	let result = 1n;
	let b = base % modulus;
	let e = exponent;
	while (e > 0n) {
		if (e & 1n) result = (result * b) % modulus;
		b = (b * b) % modulus;
		e >>= 1n;
	}
	return result;
}

async function sha1(...chunks: Uint8Array[]): Promise<Uint8Array> {
	const total = chunks.reduce((n, c) => n + c.length, 0);
	const joined = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		joined.set(c, offset);
		offset += c.length;
	}
	const digest = await crypto.subtle.digest('SHA-1', joined);
	return new Uint8Array(digest);
}

export function randomSalt(): Uint8Array {
	const salt = new Uint8Array(SALT_BYTES);
	crypto.getRandomValues(salt);
	return salt;
}

/**
 * Derive the SRP6 verifier for an account.
 *
 * Both username and password are uppercased first — the 3.3.5a client does
 * this before hashing, so credentials are effectively case-insensitive and we
 * must match that or the server will never validate a login.
 */
export async function deriveVerifier(
	username: string,
	password: string,
	salt: Uint8Array,
): Promise<Uint8Array> {
	const identity = new TextEncoder().encode(
		`${username.toUpperCase()}:${password.toUpperCase()}`,
	);
	const identityHash = await sha1(identity);
	const xHash = await sha1(salt, identityHash);
	const x = bytesToBigIntLE(xHash);
	return bigIntToBytesLE(modPow(g, x, N), SALT_BYTES);
}

export interface WowCredential {
	/** 64 uppercase hex chars, ready for MySQL UNHEX(). */
	salt: string;
	/** 64 uppercase hex chars, ready for MySQL UNHEX(). */
	verifier: string;
}

/**
 * Produce the pair the account API expects. The password is consumed here and
 * is never returned, serialized, or logged.
 */
export async function buildCredential(
	username: string,
	password: string,
): Promise<WowCredential> {
	const salt = randomSalt();
	const verifier = await deriveVerifier(username, password, salt);
	return { salt: toHexUpper(salt), verifier: toHexUpper(verifier) };
}
