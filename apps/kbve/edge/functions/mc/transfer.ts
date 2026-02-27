import {
	type McRequest,
	jsonResponse,
	createServiceClient,
	requireServiceRole,
	validateMcUuid,
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
		if (!batch || !Array.isArray(batch)) {
			return jsonResponse({ error: 'batch must be a JSON array' }, 400);
		}

		if (batch.length === 0) {
			return jsonResponse({ success: true, recorded_count: 0 });
		}

		if (batch.length > 1000) {
			return jsonResponse(
				{ error: 'Batch size exceeds limit of 1000 transfers' },
				400,
			);
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
		const uuidErr = validateMcUuid(player_uuid, 'player_uuid');
		if (uuidErr) return uuidErr;

		// Clamp pagination parameters at edge (mirrors SQL clamping)
		const rawLimit = Number(body.limit) || 50;
		const limit = Math.min(Math.max(rawLimit, 1), 500);

		const rawOffset = Number(body.offset) || 0;
		const offset = Math.max(rawOffset, 0);

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc(
			'service_get_transfer_history',
			{
				p_player_uuid: player_uuid as string,
				p_server_id: (body.server_id as string) || null,
				p_since: (body.since as string) || null,
				p_limit: limit,
				p_offset: offset,
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
