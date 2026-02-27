import {
	type McRequest,
	jsonResponse,
	createServiceClient,
	requireServiceRole,
	validateMcUuid,
	requireNonEmpty,
} from './_shared.ts';

// ---------------------------------------------------------------------------
// MC Player Module
//
// Actions:
//   save  — MC server persists a full player snapshot
//   load  — MC server loads a player snapshot by UUID + server
// ---------------------------------------------------------------------------

type Handler = (mcReq: McRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
	async save({ claims, body }) {
		const denied = requireServiceRole(claims);
		if (denied) return denied;

		const { snapshot } = body;
		if (!snapshot || typeof snapshot !== 'object') {
			return jsonResponse({ error: 'snapshot object is required' }, 400);
		}

		const snap = snapshot as Record<string, unknown>;
		const uuidErr = validateMcUuid(snap.player_uuid, 'player_uuid');
		if (uuidErr) return uuidErr;

		const serverErr = requireNonEmpty(snap.server_id, 'server_id');
		if (serverErr) return serverErr;

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_save_player', {
			p_snapshot: snapshot,
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		return jsonResponse({ success: true, player_uuid: data });
	},

	async load({ claims, body }) {
		const denied = requireServiceRole(claims);
		if (denied) return denied;

		const { player_uuid, server_id } = body;
		const uuidErr = validateMcUuid(player_uuid, 'player_uuid');
		if (uuidErr) return uuidErr;

		const serverErr = requireNonEmpty(server_id, 'server_id');
		if (serverErr) return serverErr;

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_load_player', {
			p_player_uuid: player_uuid as string,
			p_server_id: server_id as string,
		});

		if (error) {
			return jsonResponse({ found: false, error: error.message }, 400);
		}

		if (!data || (Array.isArray(data) && data.length === 0)) {
			return jsonResponse({ found: false });
		}

		const snapshot = Array.isArray(data) ? data[0] : data;
		return jsonResponse({ found: true, snapshot });
	},
};

export const PLAYER_ACTIONS = Object.keys(handlers);

export async function handlePlayer(mcReq: McRequest): Promise<Response> {
	const handler = handlers[mcReq.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown player action: ${mcReq.action}. Use: ${PLAYER_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(mcReq);
}
