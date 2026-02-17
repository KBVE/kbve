/**
 * Minimal JWT helper for e2e tests.
 *
 * Signs HS256 tokens using the same secret the gateway is started with.
 * No external deps — uses Web Crypto API available in Node 20+.
 */

const E2E_JWT_SECRET = 'e2e-test-secret-do-not-use-in-production';

function base64url(buf: ArrayBuffer): string {
	return Buffer.from(buf)
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function textEncode(str: string): Uint8Array {
	return new TextEncoder().encode(str);
}

export async function signJwt(
	payload: Record<string, unknown> = {},
): Promise<string> {
	const header = { alg: 'HS256', typ: 'JWT' };

	const now = Math.floor(Date.now() / 1000);
	const claims = {
		sub: 'e2e-test-user',
		email: 'test@example.com',
		role: 'authenticated',
		iat: now,
		exp: now + 3600,
		...payload,
	};

	const encodedHeader = base64url(textEncode(JSON.stringify(header)));
	const encodedPayload = base64url(textEncode(JSON.stringify(claims)));
	const signingInput = `${encodedHeader}.${encodedPayload}`;

	const key = await crypto.subtle.importKey(
		'raw',
		textEncode(E2E_JWT_SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);

	const signature = await crypto.subtle.sign(
		'HMAC',
		key,
		textEncode(signingInput),
	);

	return `${signingInput}.${base64url(signature)}`;
}
