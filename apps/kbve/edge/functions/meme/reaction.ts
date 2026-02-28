import {
	type MemeRequest,
	jsonResponse,
	createServiceClient,
	requireAuthenticated,
	validateMemeId,
	validateReaction,
} from './_shared.ts';

// ---------------------------------------------------------------------------
// Meme Reaction Module
//
// Actions:
//   add     -- React to a meme (or change existing reaction)
//   remove  -- Remove reaction from a meme
// ---------------------------------------------------------------------------

type Handler = (memeReq: MemeRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
	async add({ claims, body }) {
		const denied = requireAuthenticated(claims);
		if (denied) return denied;

		const userId = claims.sub;

		const { meme_id, reaction } = body;
		const memeErr = validateMemeId(meme_id);
		if (memeErr) return memeErr;

		const reactionErr = validateReaction(reaction);
		if (reactionErr) return reactionErr;

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_react', {
			p_user_id: userId,
			p_meme_id: meme_id as string,
			p_reaction: Number(reaction),
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		return jsonResponse({ success: true, meme_id: data });
	},

	async remove({ claims, body }) {
		const denied = requireAuthenticated(claims);
		if (denied) return denied;

		const userId = claims.sub;

		const { meme_id } = body;
		const memeErr = validateMemeId(meme_id);
		if (memeErr) return memeErr;

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_unreact', {
			p_user_id: userId,
			p_meme_id: meme_id as string,
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		return jsonResponse({ success: true, was_reacted: data });
	},
};

export const REACTION_ACTIONS = Object.keys(handlers);

export async function handleReaction(
	memeReq: MemeRequest,
): Promise<Response> {
	const handler = handlers[memeReq.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown reaction action: ${memeReq.action}. Use: ${REACTION_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(memeReq);
}
