import { createHmac } from 'node:crypto';

const JWT_SECRET = 'super-secret-jwt-token-for-dev';

export type JwtRole = 'service_role' | 'anon' | 'authenticated';

export interface JwtOptions {
	role?: JwtRole;
	expiresInSeconds?: number;
	expired?: boolean;
	extraClaims?: Record<string, unknown>;
}

function base64url(input: string | Buffer): string {
	const buf = typeof input === 'string' ? Buffer.from(input) : input;
	return buf.toString('base64url');
}

function signHmac(data: string, secret: string): string {
	return createHmac('sha256', secret).update(data).digest('base64url');
}

export function createJwt(options: JwtOptions = {}): string {
	const {
		role = 'service_role',
		expiresInSeconds = 3600,
		expired = false,
		extraClaims = {},
	} = options;

	const now = Math.floor(Date.now() / 1000);
	const exp = expired ? now - 3600 : now + expiresInSeconds;

	const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const payload = base64url(
		JSON.stringify({
			role,
			iss: 'supabase',
			iat: now,
			exp,
			...extraClaims,
		}),
	);

	const signature = signHmac(`${header}.${payload}`, JWT_SECRET);
	return `${header}.${payload}.${signature}`;
}

export function createBadSignatureJwt(): string {
	const now = Math.floor(Date.now() / 1000);
	const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const payload = base64url(
		JSON.stringify({
			role: 'service_role',
			iss: 'supabase',
			iat: now,
			exp: now + 3600,
		}),
	);

	const signature = signHmac(`${header}.${payload}`, 'wrong-secret-key');
	return `${header}.${payload}.${signature}`;
}
