import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import {
	type MemeRequest,
	type JwtClaims,
	extractToken,
	parseJwt,
	jsonResponse,
} from './_shared.ts';
import { handleFeed, FEED_ACTIONS } from './feed.ts';
import { handleReaction, REACTION_ACTIONS } from './reaction.ts';
import { handleSave, SAVE_ACTIONS } from './save.ts';
import { handleUser, USER_ACTIONS } from './user.ts';
import { handleComment, COMMENT_ACTIONS } from './comment.ts';
import { handleProfile, PROFILE_ACTIONS } from './profile.ts';
import { handleFollow, FOLLOW_ACTIONS } from './follow.ts';
import { handleReport, REPORT_ACTIONS } from './report.ts';

// ---------------------------------------------------------------------------
// Meme Edge Function — Unified Router
//
// Command format: "module.action"
//   feed:     list, view, share
//   reaction: add, remove
//   save:     add, remove
//   user:     reactions, saves
//   comment:  list, replies, create, delete
//   profile:  get, update, memes
//   follow:   add, remove
//   report:   create
// ---------------------------------------------------------------------------

const MODULES: Record<
	string,
	{
		handler: (memeReq: MemeRequest) => Promise<Response>;
		actions: string[];
	}
> = {
	feed: { handler: handleFeed, actions: FEED_ACTIONS },
	reaction: { handler: handleReaction, actions: REACTION_ACTIONS },
	save: { handler: handleSave, actions: SAVE_ACTIONS },
	user: { handler: handleUser, actions: USER_ACTIONS },
	comment: { handler: handleComment, actions: COMMENT_ACTIONS },
	profile: { handler: handleProfile, actions: PROFILE_ACTIONS },
	follow: { handler: handleFollow, actions: FOLLOW_ACTIONS },
	report: { handler: handleReport, actions: REPORT_ACTIONS },
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
		// Try to parse JWT — anonymous access is allowed for some actions
		let token = '';
		let claims: JwtClaims = { role: 'anon' };

		try {
			token = extractToken(req);
			claims = await parseJwt(token);
		} catch {
			// No token or invalid token — proceed as anonymous
		}

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
					error: `Invalid command format. Use "module.action" (e.g. "feed.list"). Available: ${buildHelpText()}`,
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
		console.error('meme error:', err);
		const message =
			err instanceof Error ? err.message : 'Internal server error';
		const status =
			message.includes('authorization') || message.includes('JWT')
				? 401
				: 500;
		return jsonResponse({ error: message }, status);
	}
});
