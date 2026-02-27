import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify } from 'https://deno.land/x/jose@v4.14.4/index.ts';
import { corsHeaders } from '../_shared/cors.ts';

// ---------------------------------------------------------------------------
// MC Auth Edge Function
//
// Commands:
//   request_link  — Authenticated user requests MC account link (returns 6-digit code)
//   verify        — MC server (service_role) verifies a player's code
//   status        — Authenticated user checks their link status
//   lookup        — MC server (service_role) looks up a user by MC UUID
//   unlink        — Authenticated user unlinks their MC account
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JWT_SECRET = Deno.env.get('JWT_SECRET');

interface JwtClaims {
	role?: string;
	sub?: string;
	[key: string]: unknown;
}

async function parseJwt(token: string): Promise<JwtClaims> {
	if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
	const key = new TextEncoder().encode(JWT_SECRET);
	const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
	return payload as JwtClaims;
}

function extractToken(req: Request): string {
	const authHeader = req.headers.get('authorization');
	if (!authHeader?.startsWith('Bearer ')) {
		throw new Error('Missing or invalid authorization header');
	}
	return authHeader.slice(7);
}

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { ...corsHeaders, 'Content-Type': 'application/json' },
	});
}

// Create a Supabase client scoped to the calling user (for proxy functions)
function createUserClient(token: string) {
	return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
		global: { headers: { Authorization: `Bearer ${token}` } },
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

// Create a Supabase client with service_role (for service functions)
function createServiceClient() {
	return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

serve(async (req) => {
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}

	if (req.method !== 'POST') {
		return jsonResponse({ error: 'Only POST method is allowed' }, 405);
	}

	try {
		const token = extractToken(req);
		const claims = await parseJwt(token);
		const body = await req.json();
		const { command } = body;

		if (!command) {
			return jsonResponse({ error: 'command is required' }, 400);
		}

		// -----------------------------------------------------------------
		// request_link — authenticated user requests MC link
		// Body: { command: "request_link", mc_uuid: string }
		// Returns: { success, verification_code, error? }
		// -----------------------------------------------------------------
		if (command === 'request_link') {
			if (claims.role === 'service_role') {
				return jsonResponse(
					{
						error: 'Use an authenticated user token, not service_role',
					},
					403,
				);
			}

			const { mc_uuid } = body;
			if (!mc_uuid) {
				return jsonResponse({ error: 'mc_uuid is required' }, 400);
			}

			const supabase = createUserClient(token);
			const { data, error } = await supabase.rpc('proxy_request_link', {
				p_mc_uuid: mc_uuid,
			});

			if (error) {
				return jsonResponse(
					{ success: false, error: error.message },
					400,
				);
			}

			return jsonResponse({ success: true, verification_code: data });
		}

		// -----------------------------------------------------------------
		// verify — MC server verifies a player's code
		// Body: { command: "verify", mc_uuid: string, code: number }
		// Returns: { success, user_id?, error? }
		// -----------------------------------------------------------------
		if (command === 'verify') {
			if (claims.role !== 'service_role') {
				return jsonResponse(
					{ error: 'Access denied: service_role required' },
					403,
				);
			}

			const { mc_uuid, code } = body;
			if (!mc_uuid || code === undefined) {
				return jsonResponse(
					{ error: 'mc_uuid and code are required' },
					400,
				);
			}

			const supabase = createServiceClient();
			const { data, error } = await supabase.rpc('service_verify_link', {
				p_mc_uuid: mc_uuid,
				p_code: code,
			});

			if (error) {
				return jsonResponse(
					{ success: false, error: error.message },
					400,
				);
			}

			// data is the user_id UUID on success, null on failure
			if (data) {
				return jsonResponse({ success: true, user_id: data });
			}
			return jsonResponse({
				success: false,
				error: 'Verification failed (invalid code, expired, or locked)',
			});
		}

		// -----------------------------------------------------------------
		// status — authenticated user checks their own link status
		// Body: { command: "status" }
		// Returns: { found, link?, error? }
		// -----------------------------------------------------------------
		if (command === 'status') {
			if (claims.role === 'service_role') {
				return jsonResponse(
					{
						error: 'Use an authenticated user token, not service_role',
					},
					403,
				);
			}

			const supabase = createUserClient(token);
			const { data, error } = await supabase.rpc('proxy_get_link_status');

			if (error) {
				return jsonResponse(
					{ found: false, error: error.message },
					400,
				);
			}

			if (!data || (Array.isArray(data) && data.length === 0)) {
				return jsonResponse({ found: false });
			}

			const link = Array.isArray(data) ? data[0] : data;
			return jsonResponse({ found: true, link });
		}

		// -----------------------------------------------------------------
		// lookup — MC server looks up a user by MC UUID
		// Body: { command: "lookup", mc_uuid: string }
		// Returns: { found, link?, error? }
		// -----------------------------------------------------------------
		if (command === 'lookup') {
			if (claims.role !== 'service_role') {
				return jsonResponse(
					{ error: 'Access denied: service_role required' },
					403,
				);
			}

			const { mc_uuid } = body;
			if (!mc_uuid) {
				return jsonResponse({ error: 'mc_uuid is required' }, 400);
			}

			const supabase = createServiceClient();
			const { data, error } = await supabase.rpc(
				'service_get_user_by_mc_uuid',
				{ p_mc_uuid: mc_uuid },
			);

			if (error) {
				return jsonResponse(
					{ found: false, error: error.message },
					400,
				);
			}

			if (!data || (Array.isArray(data) && data.length === 0)) {
				return jsonResponse({ found: false });
			}

			const link = Array.isArray(data) ? data[0] : data;
			return jsonResponse({ found: true, link });
		}

		// -----------------------------------------------------------------
		// unlink — authenticated user unlinks their MC account
		// Body: { command: "unlink" }
		// Returns: { success, error? }
		// -----------------------------------------------------------------
		if (command === 'unlink') {
			if (claims.role === 'service_role') {
				return jsonResponse(
					{
						error: 'Use an authenticated user token, not service_role',
					},
					403,
				);
			}

			const supabase = createUserClient(token);
			const { data, error } = await supabase.rpc('proxy_unlink');

			if (error) {
				return jsonResponse(
					{ success: false, error: error.message },
					400,
				);
			}

			return jsonResponse({ success: true, was_linked: data });
		}

		return jsonResponse(
			{
				error: 'Unknown command. Use: request_link, verify, status, lookup, unlink',
			},
			400,
		);
	} catch (err) {
		console.error('mc-auth error:', err);
		const message =
			err instanceof Error ? err.message : 'Internal server error';
		const status =
			message.includes('authorization') || message.includes('JWT')
				? 401
				: 500;
		return jsonResponse({ error: message }, status);
	}
});
