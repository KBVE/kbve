import {
	type McRequest,
	jsonResponse,
	createServiceClient,
	requireServiceRole,
	validateMcUuid,
	requireNonEmpty,
} from './_shared.ts';

// ---------------------------------------------------------------------------
// MC Character Module — DND-style RPG character system
//
// Actions:
//   save    — MC server persists a full character sheet
//   load    — MC server loads a character by player_uuid + server_id
//   add_xp  — MC server atomically adds XP and auto-levels
// ---------------------------------------------------------------------------

type Handler = (mcReq: McRequest) => Promise<Response>;

// Edge-level stat validation (belt & suspenders with SQL constraints)
function validateStats(stats: Record<string, unknown>): string | null {
	const STAT_NAMES = [
		'strength',
		'dexterity',
		'constitution',
		'intelligence',
		'wisdom',
		'charisma',
	];
	for (const name of STAT_NAMES) {
		const val = stats[name];
		if (val !== undefined && val !== null) {
			const num = Number(val);
			if (!Number.isInteger(num) || num < 1 || num > 999) {
				return `${name} must be an integer between 1 and 999`;
			}
		}
	}
	return null;
}

const handlers: Record<string, Handler> = {
	async save({ claims, body }) {
		const denied = requireServiceRole(claims);
		if (denied) return denied;

		const { character } = body;
		if (!character || typeof character !== 'object') {
			return jsonResponse({ error: 'character object is required' }, 400);
		}

		const char = character as Record<string, unknown>;
		const uuidErr = validateMcUuid(char.player_uuid, 'player_uuid');
		if (uuidErr) return uuidErr;

		const serverErr = requireNonEmpty(char.server_id, 'server_id');
		if (serverErr) return serverErr;

		// Edge-level stat validation
		if (char.base_stats && typeof char.base_stats === 'object') {
			const statErr = validateStats(
				char.base_stats as Record<string, unknown>,
			);
			if (statErr) {
				return jsonResponse({ error: statErr }, 400);
			}
		}

		// Edge-level XP validation
		if (char.experience !== undefined) {
			const xp = Number(char.experience);
			if (!Number.isFinite(xp) || xp < 0) {
				return jsonResponse(
					{ error: 'experience must be a non-negative number' },
					400,
				);
			}
		}

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_save_character', {
			p_character: character,
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
		const { data, error } = await supabase.rpc('service_load_character', {
			p_player_uuid: player_uuid as string,
			p_server_id: server_id as string,
		});

		if (error) {
			return jsonResponse({ found: false, error: error.message }, 400);
		}

		if (!data || (Array.isArray(data) && data.length === 0)) {
			return jsonResponse({ found: false });
		}

		const character = Array.isArray(data) ? data[0] : data;
		return jsonResponse({ found: true, character });
	},

	async add_xp({ claims, body }) {
		const denied = requireServiceRole(claims);
		if (denied) return denied;

		const { player_uuid, server_id, xp_amount } = body;
		const uuidErr = validateMcUuid(player_uuid, 'player_uuid');
		if (uuidErr) return uuidErr;

		const serverErr = requireNonEmpty(server_id, 'server_id');
		if (serverErr) return serverErr;

		// Edge-level XP validation
		const xp = Number(xp_amount);
		if (!Number.isFinite(xp) || !Number.isInteger(xp) || xp <= 0) {
			return jsonResponse(
				{ error: 'xp_amount must be a positive integer' },
				400,
			);
		}

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_add_experience', {
			p_player_uuid: player_uuid as string,
			p_server_id: server_id as string,
			p_xp_amount: xp,
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		if (!data || (Array.isArray(data) && data.length === 0)) {
			return jsonResponse(
				{ success: false, error: 'Character operation failed' },
				400,
			);
		}

		const result = Array.isArray(data) ? data[0] : data;
		return jsonResponse({
			success: true,
			new_level: result.new_level,
			total_experience: result.total_experience,
			leveled_up: result.leveled_up,
		});
	},
};

export const CHARACTER_ACTIONS = Object.keys(handlers);

export async function handleCharacter(mcReq: McRequest): Promise<Response> {
	const handler = handlers[mcReq.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown character action: ${mcReq.action}. Use: ${CHARACTER_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(mcReq);
}
