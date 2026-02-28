import {
	type MemeRequest,
	jsonResponse,
	createServiceClient,
	requireAuthenticated,
	validateMemeIdArray,
} from './_shared.ts';

// ---------------------------------------------------------------------------
// Meme User Module -- Batch state lookups for current user
//
// Actions:
//   reactions  -- Get current user's reactions for a batch of memes
//   saves      -- Get which memes from a batch the user has saved
// ---------------------------------------------------------------------------

type Handler = (memeReq: MemeRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
	async reactions({ claims, body }) {
		const denied = requireAuthenticated(claims);
		if (denied) return denied;

		const userId = claims.sub;

		const { meme_ids } = body;
		const idsErr = validateMemeIdArray(meme_ids);
		if (idsErr) return idsErr;

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc(
			'service_get_user_reactions',
			{
				p_user_id: userId,
				p_meme_ids: meme_ids as string[],
			},
		);

		if (error) {
			return jsonResponse({ error: error.message }, 400);
		}

		const reactions = Array.isArray(data) ? data : [];
		return jsonResponse({ reactions });
	},

	async saves({ claims, body }) {
		const denied = requireAuthenticated(claims);
		if (denied) return denied;

		const userId = claims.sub;

		const { meme_ids } = body;
		const idsErr = validateMemeIdArray(meme_ids);
		if (idsErr) return idsErr;

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc(
			'service_get_user_saves',
			{
				p_user_id: userId,
				p_meme_ids: meme_ids as string[],
			},
		);

		if (error) {
			return jsonResponse({ error: error.message }, 400);
		}

		const saves = Array.isArray(data)
			? data.map((row: { meme_id: string }) => row.meme_id)
			: [];
		return jsonResponse({ saves });
	},
};

export const USER_ACTIONS = Object.keys(handlers);

export async function handleUser(memeReq: MemeRequest): Promise<Response> {
	const handler = handlers[memeReq.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown user action: ${memeReq.action}. Use: ${USER_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(memeReq);
}
