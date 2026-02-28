import {
	type DiscordshRequest,
	jsonResponse,
	createUserClient,
	requireUserToken,
	validateSnowflake,
	verifyCaptcha,
} from './_shared.ts';

// ---------------------------------------------------------------------------
// Discordsh Vote Module
//
// Actions:
//   cast — Authenticated user votes for a server (hCaptcha required)
// ---------------------------------------------------------------------------

type Handler = (req: DiscordshRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
	async cast({ claims, token, body }) {
		const denied = requireUserToken(claims);
		if (denied) return denied;

		const { server_id, captcha_token } = body;

		const idErr = validateSnowflake(server_id, 'server_id');
		if (idErr) return idErr;

		const captchaErr = await verifyCaptcha(captcha_token);
		if (captchaErr) return captchaErr;

		const supabase = createUserClient(token);
		const { data, error } = await supabase.rpc('proxy_cast_vote', {
			p_server_id: server_id as string,
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		const row = Array.isArray(data) ? data[0] : data;
		if (!row) {
			return jsonResponse(
				{ success: false, error: 'No response from database' },
				500,
			);
		}

		return jsonResponse(
			{
				success: row.success,
				vote_id: row.vote_id,
				message: row.message,
			},
			row.success ? 200 : 400,
		);
	},
};

export const VOTE_ACTIONS = Object.keys(handlers);

export async function handleVote(req: DiscordshRequest): Promise<Response> {
	const handler = handlers[req.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown vote action: ${req.action}. Use: ${VOTE_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(req);
}
