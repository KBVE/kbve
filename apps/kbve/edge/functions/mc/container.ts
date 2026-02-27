import {
	type McRequest,
	jsonResponse,
	createServiceClient,
	requireServiceRole,
	requireNonEmpty,
} from './_shared.ts';

// ---------------------------------------------------------------------------
// MC Container Module
//
// Actions:
//   save  — MC server persists container state (chests, barrels, etc.)
//   load  — MC server loads container state by ID + server
// ---------------------------------------------------------------------------

type Handler = (mcReq: McRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
	async save({ claims, body }) {
		const denied = requireServiceRole(claims);
		if (denied) return denied;

		const { container, server_id } = body;
		if (!container || typeof container !== 'object') {
			return jsonResponse({ error: 'container object is required' }, 400);
		}

		const serverErr = requireNonEmpty(server_id, 'server_id');
		if (serverErr) return serverErr;

		const c = container as Record<string, unknown>;
		const cidErr = requireNonEmpty(c.container_id, 'container_id');
		if (cidErr) return cidErr;

		// Validate container_type range if provided
		if (c.type !== undefined) {
			const t = Number(c.type);
			if (!Number.isInteger(t) || t < 0 || t > 13) {
				return jsonResponse(
					{ error: 'container type must be 0-13' },
					400,
				);
			}
		}

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_save_container', {
			p_container: container,
			p_server_id: server_id as string,
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		return jsonResponse({ success: true, container_id: data });
	},

	async load({ claims, body }) {
		const denied = requireServiceRole(claims);
		if (denied) return denied;

		const { container_id, server_id } = body;
		const cidErr = requireNonEmpty(container_id, 'container_id');
		if (cidErr) return cidErr;

		const serverErr = requireNonEmpty(server_id, 'server_id');
		if (serverErr) return serverErr;

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_load_container', {
			p_container_id: container_id as string,
			p_server_id: server_id as string,
		});

		if (error) {
			return jsonResponse({ found: false, error: error.message }, 400);
		}

		if (!data || (Array.isArray(data) && data.length === 0)) {
			return jsonResponse({ found: false });
		}

		const container = Array.isArray(data) ? data[0] : data;
		return jsonResponse({ found: true, container });
	},
};

export const CONTAINER_ACTIONS = Object.keys(handlers);

export async function handleContainer(mcReq: McRequest): Promise<Response> {
	const handler = handlers[mcReq.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown container action: ${mcReq.action}. Use: ${CONTAINER_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(mcReq);
}
