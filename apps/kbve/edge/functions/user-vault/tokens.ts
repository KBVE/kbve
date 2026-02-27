import { jsonResponse, createServiceClient } from '../_shared/supabase.ts';
import type { VaultRequest } from './index.ts';

// ---------------------------------------------------------------------------
// Token CRUD handlers — all use service client to call service_* RPCs
// ---------------------------------------------------------------------------

type Handler = (req: VaultRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
	async set_token({ userId, body }) {
		const { token_name, service, token_value, description } = body;

		if (!token_name || typeof token_name !== 'string') {
			return jsonResponse(
				{
					error: 'token_name is required (3-64 chars, a-zA-Z0-9_-)',
				},
				400,
			);
		}
		if (!service || typeof service !== 'string') {
			return jsonResponse(
				{
					error: 'service is required (2-32 chars, lowercase a-z0-9_)',
				},
				400,
			);
		}
		if (!token_value || typeof token_value !== 'string') {
			return jsonResponse({ error: 'token_value is required' }, 400);
		}

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_set_api_token', {
			p_user_id: userId,
			p_token_name: token_name as string,
			p_service: service as string,
			p_token_value: token_value as string,
			p_description: (description as string) || null,
		});

		if (error) {
			return jsonResponse({ error: error.message }, 400);
		}

		return jsonResponse({ success: true, token_id: data });
	},

	async get_token({ userId, body }) {
		const { token_id } = body;
		if (!token_id || typeof token_id !== 'string') {
			return jsonResponse({ error: 'token_id (UUID) is required' }, 400);
		}

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_get_api_token', {
			p_user_id: userId,
			p_token_id: token_id as string,
		});

		if (error) {
			return jsonResponse({ error: error.message }, 400);
		}

		return jsonResponse({ success: true, token_value: data });
	},

	async list_tokens({ userId }) {
		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_list_api_tokens', {
			p_user_id: userId,
		});

		if (error) {
			return jsonResponse({ error: error.message }, 400);
		}

		const tokens = Array.isArray(data) ? data : [];
		return jsonResponse({ success: true, tokens, count: tokens.length });
	},

	async delete_token({ userId, body }) {
		const { token_id } = body;
		if (!token_id || typeof token_id !== 'string') {
			return jsonResponse({ error: 'token_id (UUID) is required' }, 400);
		}

		const supabase = createServiceClient();
		const { error } = await supabase.rpc('service_delete_api_token', {
			p_user_id: userId,
			p_token_id: token_id as string,
		});

		if (error) {
			return jsonResponse({ error: error.message }, 400);
		}

		return jsonResponse({ success: true });
	},

	async toggle_token({ userId, body }) {
		const { token_id, is_active } = body;
		if (!token_id || typeof token_id !== 'string') {
			return jsonResponse({ error: 'token_id (UUID) is required' }, 400);
		}
		if (typeof is_active !== 'boolean') {
			return jsonResponse(
				{ error: 'is_active (boolean) is required' },
				400,
			);
		}

		const supabase = createServiceClient();
		const { error } = await supabase.rpc(
			'service_toggle_api_token_status',
			{
				p_user_id: userId,
				p_token_id: token_id as string,
				p_is_active: is_active as boolean,
			},
		);

		if (error) {
			return jsonResponse({ error: error.message }, 400);
		}

		return jsonResponse({ success: true });
	},
};

export const TOKEN_ACTIONS = Object.keys(handlers);

export async function handleTokens(vaultReq: VaultRequest): Promise<Response> {
	const handler = handlers[vaultReq.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown token action: ${vaultReq.action}. Use: ${TOKEN_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(vaultReq);
}
