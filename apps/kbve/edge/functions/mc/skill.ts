import {
	type McRequest,
	jsonResponse,
	createServiceClient,
	requireServiceRole,
	validateMcUuid,
	requireNonEmpty,
} from './_shared.ts';

// ---------------------------------------------------------------------------
// MC Skill Module — Per-skill progression (skill tree)
//
// Actions:
//   save    — MC server persists a full skill tree (bulk upsert)
//   load    — MC server loads all skills for a player on a server
//   add_xp  — MC server atomically adds XP to a specific skill
// ---------------------------------------------------------------------------

type Handler = (mcReq: McRequest) => Promise<Response>;

// Valid skill categories (McSkillCategory enum)
const VALID_CATEGORIES = [0, 1, 2, 3, 4];

// Edge-level skill_id format validation
function isValidSkillId(id: unknown): boolean {
	return (
		typeof id === 'string' &&
		id.length >= 1 &&
		id.length <= 64 &&
		/^[a-z0-9_]+$/.test(id)
	);
}

const handlers: Record<string, Handler> = {
	async save({ claims, body }) {
		const denied = requireServiceRole(claims);
		if (denied) return denied;

		const { skill_tree } = body;
		if (!skill_tree || typeof skill_tree !== 'object') {
			return jsonResponse(
				{ error: 'skill_tree object is required' },
				400,
			);
		}

		const tree = skill_tree as Record<string, unknown>;
		const uuidErr = validateMcUuid(tree.player_uuid, 'player_uuid');
		if (uuidErr) return uuidErr;

		const serverErr = requireNonEmpty(tree.server_id, 'server_id');
		if (serverErr) return serverErr;

		// Edge-level skills array validation
		const skills = tree.skills;
		if (!Array.isArray(skills)) {
			return jsonResponse({ error: 'skills must be an array' }, 400);
		}

		if (skills.length > 200) {
			return jsonResponse(
				{ error: 'Skill tree exceeds limit of 200 skills' },
				400,
			);
		}

		for (const skill of skills) {
			const s = skill as Record<string, unknown>;
			if (!isValidSkillId(s.skill_id)) {
				return jsonResponse(
					{
						error: `Invalid skill_id: ${s.skill_id}. Must be 1-64 lowercase alphanumeric/underscores.`,
					},
					400,
				);
			}
			if (
				s.category !== undefined &&
				!VALID_CATEGORIES.includes(Number(s.category))
			) {
				return jsonResponse(
					{
						error: `Invalid category for skill ${s.skill_id}. Must be 0-4.`,
					},
					400,
				);
			}
			if (s.experience !== undefined) {
				const xp = Number(s.experience);
				if (!Number.isFinite(xp) || xp < 0) {
					return jsonResponse(
						{
							error: `experience for skill ${s.skill_id} must be non-negative`,
						},
						400,
					);
				}
			}
		}

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_save_skill_tree', {
			p_skill_tree: skill_tree,
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		return jsonResponse({ success: true, skills_saved: data });
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
		const { data, error } = await supabase.rpc('service_load_skill_tree', {
			p_player_uuid: player_uuid as string,
			p_server_id: server_id as string,
		});

		if (error) {
			return jsonResponse({ found: false, error: error.message }, 400);
		}

		if (!data || (Array.isArray(data) && data.length === 0)) {
			return jsonResponse({ found: false, skills: [] });
		}

		const skills = Array.isArray(data) ? data : [data];
		return jsonResponse({ found: true, skills });
	},

	async add_xp({ claims, body }) {
		const denied = requireServiceRole(claims);
		if (denied) return denied;

		const { player_uuid, server_id, skill_id, category, xp_amount } = body;

		const uuidErr = validateMcUuid(player_uuid, 'player_uuid');
		if (uuidErr) return uuidErr;

		const serverErr = requireNonEmpty(server_id, 'server_id');
		if (serverErr) return serverErr;

		if (!isValidSkillId(skill_id)) {
			return jsonResponse(
				{
					error: 'skill_id is required and must be 1-64 lowercase alphanumeric/underscores',
				},
				400,
			);
		}

		if (
			category !== undefined &&
			!VALID_CATEGORIES.includes(Number(category))
		) {
			return jsonResponse({ error: 'category must be 0-4' }, 400);
		}

		const xp = Number(xp_amount);
		if (!Number.isFinite(xp) || !Number.isInteger(xp) || xp <= 0) {
			return jsonResponse(
				{ error: 'xp_amount must be a positive integer' },
				400,
			);
		}

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_add_skill_xp', {
			p_player_uuid: player_uuid as string,
			p_server_id: server_id as string,
			p_skill_id: skill_id as string,
			p_category: Number(category) || 0,
			p_xp_amount: xp,
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		if (!data || (Array.isArray(data) && data.length === 0)) {
			return jsonResponse(
				{ success: false, error: 'Skill XP operation failed' },
				400,
			);
		}

		const result = Array.isArray(data) ? data[0] : data;
		return jsonResponse({
			success: true,
			skill_id,
			new_level: result.new_level,
			total_experience: result.total_experience,
			leveled_up: result.leveled_up,
		});
	},
};

export const SKILL_ACTIONS = Object.keys(handlers);

export async function handleSkill(mcReq: McRequest): Promise<Response> {
	const handler = handlers[mcReq.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown skill action: ${mcReq.action}. Use: ${SKILL_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(mcReq);
}
