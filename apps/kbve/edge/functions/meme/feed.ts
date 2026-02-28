import {
	type MemeRequest,
	jsonResponse,
	createServiceClient,
	validateMemeId,
	validateTag,
} from './_shared.ts';

// ---------------------------------------------------------------------------
// Meme Feed Module
//
// Actions:
//   list  -- Fetch published memes feed with keyset pagination
// ---------------------------------------------------------------------------

type Handler = (memeReq: MemeRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
	async list({ body }) {
		// No auth check — anonymous browsing allowed

		const { limit, cursor, tag } = body;

		// Validate limit
		let safeLimit = 20;
		if (limit !== undefined) {
			const num = Number(limit);
			if (!Number.isInteger(num) || num < 1 || num > 50) {
				return jsonResponse(
					{ error: 'limit must be an integer between 1 and 50' },
					400,
				);
			}
			safeLimit = num;
		}

		// Validate cursor (optional ULID)
		if (cursor !== undefined && cursor !== null) {
			const cursorErr = validateMemeId(cursor, 'cursor');
			if (cursorErr) return cursorErr;
		}

		// Validate tag (optional)
		if (tag !== undefined && tag !== null) {
			const tagErr = validateTag(tag);
			if (tagErr) return tagErr;
		}

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_fetch_feed', {
			p_limit: safeLimit,
			p_cursor: (cursor as string) ?? null,
			p_tag: (tag as string) ?? null,
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

export const FEED_ACTIONS = Object.keys(handlers);

export async function handleFeed(memeReq: MemeRequest): Promise<Response> {
	const handler = handlers[memeReq.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown feed action: ${memeReq.action}. Use: ${FEED_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(memeReq);
}
