import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import {
	type JwtClaims,
	extractToken,
	parseJwt,
	jsonResponse,
} from '../_shared/supabase.ts';
import { handleTokens, TOKEN_ACTIONS } from './tokens.ts';

// ---------------------------------------------------------------------------
// User Vault Edge Function — Unified Router
//
// Dual-auth: service_role (with user_id in body) or authenticated (sub claim)
//
// Command format: "tokens.action"
//   tokens: set_token, get_token, list_tokens, delete_token, toggle_token
// ---------------------------------------------------------------------------

export interface VaultRequest {
	token: string;
	claims: JwtClaims;
	body: Record<string, unknown>;
	action: string;
	userId: string;
}

const MODULES: Record<
	string,
	{
		handler: (req: VaultRequest) => Promise<Response>;
		actions: string[];
	}
> = {
	tokens: { handler: handleTokens, actions: TOKEN_ACTIONS },
};

function buildHelpText(): string {
	const commands: string[] = [];
	for (const [mod, { actions }] of Object.entries(MODULES)) {
		for (const action of actions) {
			commands.push(`${mod}.${action}`);
		}
	}
	return commands.join(', ');
}

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveUserId(
	claims: JwtClaims,
	body: Record<string, unknown>,
): string | Response {
	if (claims.role === 'service_role') {
		const userId = body.user_id;
		if (!userId || typeof userId !== 'string') {
			return jsonResponse(
				{ error: 'user_id is required in body for service_role calls' },
				400,
			);
		}
		if (!UUID_RE.test(userId)) {
			return jsonResponse({ error: 'user_id must be a valid UUID' }, 400);
		}
		return userId;
	}

	if (claims.role === 'authenticated') {
		const sub = claims.sub;
		if (!sub || typeof sub !== 'string') {
			return jsonResponse({ error: 'JWT is missing sub claim' }, 401);
		}
		return sub;
	}

	return jsonResponse(
		{ error: 'Access denied: authenticated or service_role required' },
		403,
	);
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

		if (!command || typeof command !== 'string') {
			return jsonResponse(
				{
					error: `command is required (format: "module.action"). Available: ${buildHelpText()}`,
				},
				400,
			);
		}

		const dotIndex = command.indexOf('.');
		if (dotIndex === -1) {
			return jsonResponse(
				{
					error: `Invalid command format. Use "module.action". Available: ${buildHelpText()}`,
				},
				400,
			);
		}

		const moduleName = command.slice(0, dotIndex);
		const action = command.slice(dotIndex + 1);

		const mod = MODULES[moduleName];
		if (!mod) {
			return jsonResponse(
				{
					error: `Unknown module: ${moduleName}. Available: ${Object.keys(MODULES).join(', ')}`,
				},
				400,
			);
		}

		const userIdOrError = resolveUserId(claims, body);
		if (userIdOrError instanceof Response) {
			return userIdOrError;
		}

		return mod.handler({
			token,
			claims,
			body,
			action,
			userId: userIdOrError,
		});
	} catch (err) {
		console.error('user-vault error:', err);
		const message =
			err instanceof Error ? err.message : 'Internal server error';
		const status =
			message.includes('authorization') || message.includes('JWT')
				? 401
				: 500;
		return jsonResponse({ error: message }, status);
	}
});
