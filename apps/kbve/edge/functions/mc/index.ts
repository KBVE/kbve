import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { extractToken, parseJwt, jsonResponse } from './_shared.ts';
import { handleAuth, AUTH_ACTIONS } from './auth.ts';
import { handlePlayer, PLAYER_ACTIONS } from './player.ts';
import { handleContainer, CONTAINER_ACTIONS } from './container.ts';
import { handleTransfer, TRANSFER_ACTIONS } from './transfer.ts';
import { handleCharacter, CHARACTER_ACTIONS } from './character.ts';
import { handleSkill, SKILL_ACTIONS } from './skill.ts';

// ---------------------------------------------------------------------------
// MC Edge Function — Unified Router
//
// Command format: "module.action"
//   auth:      request_link, verify, status, lookup, unlink
//   player:    save, load
//   container: save, load
//   transfer:  record, history
//   character: save, load, add_xp
//   skill:     save, load, add_xp
// ---------------------------------------------------------------------------

const MODULES: Record<
	string,
	{
		handler: (mcReq: import('./_shared.ts').McRequest) => Promise<Response>;
		actions: string[];
	}
> = {
	auth: { handler: handleAuth, actions: AUTH_ACTIONS },
	player: { handler: handlePlayer, actions: PLAYER_ACTIONS },
	container: { handler: handleContainer, actions: CONTAINER_ACTIONS },
	transfer: { handler: handleTransfer, actions: TRANSFER_ACTIONS },
	character: { handler: handleCharacter, actions: CHARACTER_ACTIONS },
	skill: { handler: handleSkill, actions: SKILL_ACTIONS },
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
					error: `Invalid command format. Use "module.action" (e.g. "auth.request_link"). Available: ${buildHelpText()}`,
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
					error: `Unknown module: ${moduleName}. Available modules: ${Object.keys(MODULES).join(', ')}`,
				},
				400,
			);
		}

		return mod.handler({ token, claims, body, action });
	} catch (err) {
		console.error('mc error:', err);
		const message =
			err instanceof Error ? err.message : 'Internal server error';
		const status =
			message.includes('authorization') || message.includes('JWT')
				? 401
				: 500;
		return jsonResponse({ error: message }, status);
	}
});
