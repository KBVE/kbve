import {
	type McRequest,
	jsonResponse,
	createUserClient,
	createServiceClient,
	requireUserToken,
	requireServiceRole,
} from './_shared.ts';

// ---------------------------------------------------------------------------
// MC Auth Module
//
// Actions:
//   request_link  — Authenticated user requests MC account link (returns 6-digit code)
//   verify        — MC server (service_role) verifies a player's code
//   status        — Authenticated user checks their link status
//   lookup        — MC server (service_role) looks up a user by MC UUID
//   unlink        — Authenticated user unlinks their MC account
// ---------------------------------------------------------------------------

type Handler = (mcReq: McRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
	async request_link({ claims, token, body }) {
		const denied = requireUserToken(claims);
		if (denied) return denied;

		const { mc_uuid } = body;
		if (!mc_uuid) {
			return jsonResponse({ error: 'mc_uuid is required' }, 400);
		}

		const supabase = createUserClient(token);
		const { data, error } = await supabase.rpc('proxy_request_link', {
			p_mc_uuid: mc_uuid as string,
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		return jsonResponse({ success: true, verification_code: data });
	},

	async verify({ claims, body }) {
		const denied = requireServiceRole(claims);
		if (denied) return denied;

		const { mc_uuid, code } = body;
		if (!mc_uuid || code === undefined) {
			return jsonResponse(
				{ error: 'mc_uuid and code are required' },
				400,
			);
		}

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_verify_link', {
			p_mc_uuid: mc_uuid as string,
			p_code: code as number,
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		if (data) {
			return jsonResponse({ success: true, user_id: data });
		}
		return jsonResponse({
			success: false,
			error: 'Verification failed (invalid code, expired, or locked)',
		});
	},

	async status({ claims, token }) {
		const denied = requireUserToken(claims);
		if (denied) return denied;

		const supabase = createUserClient(token);
		const { data, error } = await supabase.rpc('proxy_get_link_status');

		if (error) {
			return jsonResponse({ found: false, error: error.message }, 400);
		}

		if (!data || (Array.isArray(data) && data.length === 0)) {
			return jsonResponse({ found: false });
		}

		const link = Array.isArray(data) ? data[0] : data;
		return jsonResponse({ found: true, link });
	},

	async lookup({ claims, body }) {
		const denied = requireServiceRole(claims);
		if (denied) return denied;

		const { mc_uuid } = body;
		if (!mc_uuid) {
			return jsonResponse({ error: 'mc_uuid is required' }, 400);
		}

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc(
			'service_get_user_by_mc_uuid',
			{ p_mc_uuid: mc_uuid as string },
		);

		if (error) {
			return jsonResponse({ found: false, error: error.message }, 400);
		}

		if (!data || (Array.isArray(data) && data.length === 0)) {
			return jsonResponse({ found: false });
		}

		const link = Array.isArray(data) ? data[0] : data;
		return jsonResponse({ found: true, link });
	},

	async unlink({ claims, token }) {
		const denied = requireUserToken(claims);
		if (denied) return denied;

		const supabase = createUserClient(token);
		const { data, error } = await supabase.rpc('proxy_unlink');

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		return jsonResponse({ success: true, was_linked: data });
	},
};

export const AUTH_ACTIONS = Object.keys(handlers);

export async function handleAuth(mcReq: McRequest): Promise<Response> {
	const handler = handlers[mcReq.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown auth action: ${mcReq.action}. Use: ${AUTH_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(mcReq);
}
