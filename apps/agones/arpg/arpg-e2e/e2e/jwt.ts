/**
 * Minimal Supabase-style HS256 JWT signer for arpg-server e2e.
 *
 * arpg-server in HS256 mode (`SUPABASE_JWT_SECRET` set, no GoTrue verifier) runs
 * `verify_supabase_jwt(jwt, secret)`, so these tokens authenticate a fake player
 * without a live Supabase. The canonical `kbve_username` claim is what the sim
 * admits the player under. Web Crypto only — no jwt dep (matches irc-e2e).
 */

import { JWT_SECRET } from './env';

function base64url(buf: ArrayBuffer | Uint8Array): string {
	return Buffer.from(buf as ArrayBuffer)
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
		aud: 'authenticated',
		kbve_username: 'e2e_player',
		iat: now,
		exp: now + 3600,
		...payload,
	};

	const encodedHeader = base64url(textEncode(JSON.stringify(header)));
	const encodedPayload = base64url(textEncode(JSON.stringify(claims)));
	const signingInput = `${encodedHeader}.${encodedPayload}`;

	const key = await crypto.subtle.importKey(
		'raw',
		textEncode(JWT_SECRET) as BufferSource,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);

	const signature = await crypto.subtle.sign(
		'HMAC',
		key,
		textEncode(signingInput) as BufferSource,
	);

	return `${signingInput}.${base64url(signature)}`;
}
