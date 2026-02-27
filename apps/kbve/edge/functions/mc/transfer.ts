import {
	type McRequest,
	jsonResponse,
	createServiceClient,
	requireServiceRole,
} from './_shared.ts';

// ---------------------------------------------------------------------------
// MC Transfer Module
//
// Actions:
//   record   — MC server records a batch of item transfer events
//   history  — MC server queries transfer history for a player
// ---------------------------------------------------------------------------

type Handler = (mcReq: McRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
	async record({ claims, body }) {
		const denied = requireServiceRole(claims);
		if (denied) return denied;

		const { batch } = body;
		if (!batch) {
			return jsonResponse({ error: 'batch is required' }, 400);
		}

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_record_transfers', {
			p_batch: batch,
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		return jsonResponse({ success: true, recorded_count: data });
	},

	async history({ claims, body }) {
		const denied = requireServiceRole(claims);
		if (denied) return denied;

		const { player_uuid } = body;
		if (!player_uuid) {
			return jsonResponse({ error: 'player_uuid is required' }, 400);
		}

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc(
			'service_get_transfer_history',
			{
				p_player_uuid: player_uuid as string,
				p_server_id: (body.server_id as string) || null,
				p_since: (body.since as string) || null,
				p_limit: (body.limit as number) || 50,
				p_offset: (body.offset as number) || 0,
			},
		);

		if (error) {
			return jsonResponse({ error: error.message }, 400);
		}

		const transfers = Array.isArray(data) ? data : [];
		return jsonResponse({ transfers, total_count: transfers.length });
	},
};

export const TRANSFER_ACTIONS = Object.keys(handlers);

export async function handleTransfer(mcReq: McRequest): Promise<Response> {
	const handler = handlers[mcReq.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown transfer action: ${mcReq.action}. Use: ${TRANSFER_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(mcReq);
}
