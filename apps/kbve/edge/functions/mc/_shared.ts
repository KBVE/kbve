import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify } from 'https://deno.land/x/jose@v4.14.4/index.ts';
import { corsHeaders } from '../_shared/cors.ts';

// ---------------------------------------------------------------------------
// Shared utilities for all MC edge function modules
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JWT_SECRET = Deno.env.get('JWT_SECRET');

export interface JwtClaims {
	role?: string;
	sub?: string;
	[key: string]: unknown;
}

export interface McRequest {
	token: string;
	claims: JwtClaims;
	body: Record<string, unknown>;
	action: string;
}

export async function parseJwt(token: string): Promise<JwtClaims> {
	if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
	const key = new TextEncoder().encode(JWT_SECRET);
	const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
	return payload as JwtClaims;
}

export function extractToken(req: Request): string {
	const authHeader = req.headers.get('authorization');
	if (!authHeader?.startsWith('Bearer ')) {
		throw new Error('Missing or invalid authorization header');
	}
	return authHeader.slice(7);
}

export function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { ...corsHeaders, 'Content-Type': 'application/json' },
	});
}

export function createUserClient(token: string) {
	return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
		global: { headers: { Authorization: `Bearer ${token}` } },
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

export function createServiceClient() {
	return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

export function requireUserToken(claims: JwtClaims): Response | null {
	if (claims.role === 'service_role') {
		return jsonResponse(
			{ error: 'Use an authenticated user token, not service_role' },
			403,
		);
	}
	return null;
}

export function requireServiceRole(claims: JwtClaims): Response | null {
	if (claims.role !== 'service_role') {
		return jsonResponse(
			{ error: 'Access denied: service_role required' },
			403,
		);
	}
	return null;
}

// MC UUID format: 32 lowercase hex characters (no dashes), matches SQL CHECK
const MC_UUID_RE = /^[a-f0-9]{32}$/;

export function isValidMcUuid(uuid: unknown): boolean {
	return typeof uuid === 'string' && MC_UUID_RE.test(uuid);
}

export function validateMcUuid(
	uuid: unknown,
	field = 'mc_uuid',
): Response | null {
	if (!uuid || typeof uuid !== 'string') {
		return jsonResponse({ error: `${field} is required` }, 400);
	}
	// Accept dashed UUIDs (normalize by stripping dashes)
	const clean = uuid.replace(/-/g, '').toLowerCase();
	if (!MC_UUID_RE.test(clean)) {
		return jsonResponse(
			{ error: `${field} must be a valid Minecraft UUID (32 hex chars)` },
			400,
		);
	}
	return null;
}

export function requireNonEmpty(
	value: unknown,
	field: string,
): Response | null {
	if (!value || (typeof value === 'string' && value.trim() === '')) {
		return jsonResponse({ error: `${field} is required` }, 400);
	}
	return null;
}
