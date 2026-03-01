import {
	type MemeRequest,
	jsonResponse,
	createServiceClient,
	requireAuthenticated,
	validateUserId,
	validateLimit,
	validateCursor,
} from './_shared.ts';

// ---------------------------------------------------------------------------
// Meme Profile Module
//
// Actions:
//   get    -- Fetch public user profile (anonymous OK)
//   update -- Update own profile (auth required)
//   memes  -- Fetch user's published memes (anonymous OK)
// ---------------------------------------------------------------------------

type Handler = (memeReq: MemeRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
	async get({ body }) {
		const { user_id } = body;

		const idErr = validateUserId(user_id);
		if (idErr) return idErr;

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_get_profile', {
			p_user_id: user_id as string,
		});

		if (error) {
			return jsonResponse({ error: error.message }, 400);
		}

		const rows = Array.isArray(data) ? data : [];
		return jsonResponse({ profile: rows[0] ?? null });
	},

	async update({ claims, body }) {
		const denied = requireAuthenticated(claims);
		if (denied) return denied;

		const userId = claims.sub;

		const { display_name, avatar_url, bio } = body;

		// At least one field must be provided
		if (
			display_name === undefined &&
			avatar_url === undefined &&
			bio === undefined
		) {
			return jsonResponse(
				{
					error: 'At least one of display_name, avatar_url, or bio must be provided',
				},
				400,
			);
		}

		// Validate display_name if provided
		if (display_name !== undefined && display_name !== null) {
			if (
				typeof display_name !== 'string' ||
				display_name.trim().length < 1 ||
				display_name.trim().length > 50
			) {
				return jsonResponse(
					{
						error: 'display_name must be between 1 and 50 characters',
					},
					400,
				);
			}
		}

		// Validate avatar_url if provided
		if (avatar_url !== undefined && avatar_url !== null) {
			if (
				typeof avatar_url !== 'string' ||
				!avatar_url.startsWith('https://')
			) {
				return jsonResponse(
					{ error: 'avatar_url must be a valid HTTPS URL' },
					400,
				);
			}
		}

		// Validate bio if provided
		if (bio !== undefined && bio !== null) {
			if (typeof bio !== 'string' || bio.length > 500) {
				return jsonResponse(
					{ error: 'bio must be at most 500 characters' },
					400,
				);
			}
		}

		const supabase = createServiceClient();
		const { error } = await supabase.rpc('service_upsert_profile', {
			p_user_id: userId,
			p_display_name: (display_name as string) ?? null,
			p_avatar_url: (avatar_url as string) ?? null,
			p_bio: (bio as string) ?? null,
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		return jsonResponse({ success: true });
	},

	async memes({ body }) {
		const { user_id, limit, cursor } = body;

		const idErr = validateUserId(user_id);
		if (idErr) return idErr;

		const { value: safeLimit, error: limitErr } = validateLimit(limit);
		if (limitErr) return limitErr;

		const cursorErr = validateCursor(cursor);
		if (cursorErr) return cursorErr;

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_get_user_memes', {
			p_user_id: user_id as string,
			p_limit: safeLimit,
			p_cursor: (cursor as string) ?? null,
		});

		if (error) {
			return jsonResponse({ error: error.message }, 400);
		}

		const memes = Array.isArray(data) ? data : [];
		const hasMore = memes.length === safeLimit;
		const nextCursor =
			hasMore && memes.length > 0
				? memes[memes.length - 1].id
				: null;

		return jsonResponse({ memes, nextCursor, hasMore });
	},
};

export const PROFILE_ACTIONS = Object.keys(handlers);

export async function handleProfile(
	memeReq: MemeRequest,
): Promise<Response> {
	const handler = handlers[memeReq.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown profile action: ${memeReq.action}. Use: ${PROFILE_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(memeReq);
}
