import {
	type MemeRequest,
	jsonResponse,
	createServiceClient,
	requireAuthenticated,
	validateMemeId,
} from './_shared.ts';

// ---------------------------------------------------------------------------
// Meme Save Module
//
// Actions:
//   add     -- Save/bookmark a meme (to default collection)
//   remove  -- Unsave/unbookmark a meme
// ---------------------------------------------------------------------------

type Handler = (memeReq: MemeRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
	async add({ claims, body }) {
		const denied = requireAuthenticated(claims);
		if (denied) return denied;

		const userId = claims.sub;

		const { meme_id } = body;
		const memeErr = validateMemeId(meme_id);
		if (memeErr) return memeErr;

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_save_meme', {
			p_user_id: userId,
			p_meme_id: meme_id as string,
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		return jsonResponse({ success: true, is_new_save: data });
	},

	async remove({ claims, body }) {
		const denied = requireAuthenticated(claims);
		if (denied) return denied;

		const userId = claims.sub;

		const { meme_id } = body;
		const memeErr = validateMemeId(meme_id);
		if (memeErr) return memeErr;

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_unsave_meme', {
			p_user_id: userId,
			p_meme_id: meme_id as string,
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		return jsonResponse({ success: true, was_saved: data });
	},
};

export const SAVE_ACTIONS = Object.keys(handlers);

export async function handleSave(memeReq: MemeRequest): Promise<Response> {
	const handler = handlers[memeReq.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown save action: ${memeReq.action}. Use: ${SAVE_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(memeReq);
}
