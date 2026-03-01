import {
	type MemeRequest,
	jsonResponse,
	createServiceClient,
	requireAuthenticated,
	validateMemeId,
	validateReportReason,
	validateReportDetail,
} from './_shared.ts';

// ---------------------------------------------------------------------------
// Meme Report Module
//
// Actions:
//   create -- Submit a content report on a meme (auth required)
// ---------------------------------------------------------------------------

type Handler = (memeReq: MemeRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
	async create({ claims, body }) {
		const denied = requireAuthenticated(claims);
		if (denied) return denied;

		const userId = claims.sub;

		const { meme_id, reason, detail } = body;

		const memeErr = validateMemeId(meme_id);
		if (memeErr) return memeErr;

		const reasonErr = validateReportReason(reason);
		if (reasonErr) return reasonErr;

		const detailErr = validateReportDetail(detail);
		if (detailErr) return detailErr;

		const supabase = createServiceClient();
		const { data, error } = await supabase.rpc('service_report_meme', {
			p_reporter_id: userId,
			p_meme_id: meme_id as string,
			p_reason: Number(reason),
			p_detail: (detail as string) ?? null,
		});

		if (error) {
			return jsonResponse({ success: false, error: error.message }, 400);
		}

		// NULL means user already has an open report for this meme
		if (data === null) {
			return jsonResponse({
				success: true,
				report_id: null,
				already_reported: true,
			});
		}

		return jsonResponse({ success: true, report_id: data });
	},
};

export const REPORT_ACTIONS = Object.keys(handlers);

export async function handleReport(
	memeReq: MemeRequest,
): Promise<Response> {
	const handler = handlers[memeReq.action];
	if (!handler) {
		return jsonResponse(
			{
				error: `Unknown report action: ${memeReq.action}. Use: ${REPORT_ACTIONS.join(', ')}`,
			},
			400,
		);
	}
	return handler(memeReq);
}
