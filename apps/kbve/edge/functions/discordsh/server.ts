import {
	type DiscordshRequest,
	jsonResponse,
	createUserClient,
	requireUserToken,
	validateSnowflake,
	requireNonEmpty,
	verifyCaptcha,
} from './_shared.ts';

// ---------------------------------------------------------------------------
// Discordsh Server Module
//
// Actions:
//   submit — Authenticated user submits a server for review (hCaptcha required)
// ---------------------------------------------------------------------------

type Handler = (req: DiscordshRequest) => Promise<Response>;

const INVITE_CODE_RE = /^[a-zA-Z0-9_-]{2,32}$/;

const handlers: Record<string, Handler> = {
	async submit({ claims, token, body }) {
		const denied = requireUserToken(claims);
		if (denied) return denied;

		const {
			server_id,
			name,
			summary,
			invite_code,
			captcha_token,
			description,
			icon_url,
			banner_url,
			categories,
			tags,
		} = body;

		const idErr = validateSnowflake(server_id, 'server_id');
		if (idErr) return idErr;

		const nameErr = requireNonEmpty(name, 'name');
		if (nameErr) return nameErr;

		const summaryErr = requireNonEmpty(summary, 'summary');
		if (summaryErr) return summaryErr;

		if (
			!invite_code ||
			typeof invite_code !== 'string' ||
			!INVITE_CODE_RE.test(invite_code)
		) {
			return jsonResponse(
				{ error: 'invite_code must be 2-32 alphanumeric characters' },
				400,
			);
		}

		const captchaErr = await verifyCaptcha(captcha_token);
		if (captchaErr) return captchaErr;

		const rpcArgs: Record<string, unknown> = {
			p_server_id: server_id as string,
			p_name: name as string,
			p_summary: summary as string,
			p_invite_code: invite_code as string,
		};

		if (description && typeof description === 'string') {
			rpcArgs.p_description = description;
		}
		if (icon_url && typeof icon_url === 'string') {
			rpcArgs.p_icon_url = icon_url;
		}
		if (banner_url && typeof banner_url === 'string') {
			rpcArgs.p_banner_url = banner_url;
		}
		if (Array.isArray(categories)) {
			rpcArgs.p_categories = categories;
		}
		if (Array.isArray(tags)) {
			rpcArgs.p_tags = tags;
		}

		const supabase = createUserClient(token);
		const { data, error } = await supabase.rpc(
			'proxy_submit_server',
			rpcArgs,
		);

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
				server_id: row.server_id,
				message: row.message,
			},
			row.success ? 200 : 400,
		);
	},
};

export const SERVER_ACTIONS = Object.keys(handlers);

export async function handleServer(req: DiscordshRequest): Promise<Response> {
	const handler = handlers[req.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown server action: ${req.action}. Use: ${SERVER_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(req);
}
