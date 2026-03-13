import { authBridge } from '../supa';

const EDGE_URL = 'https://supabase.kbve.com/functions/v1/discordsh';

interface EdgeResponse {
	success: boolean;
	error?: string;
	[key: string]: unknown;
}

async function callEdge(
	command: string,
	payload: Record<string, unknown>,
): Promise<EdgeResponse> {
	const session = await authBridge.getSession();
	if (!session?.access_token) {
		return { success: false, error: 'Not authenticated. Please sign in.' };
	}

	const res = await fetch(EDGE_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${session.access_token}`,
		},
		body: JSON.stringify({ command, ...payload }),
	});

	const data = await res.json();
	return data as EdgeResponse;
}

export async function castVote(
	serverId: string,
	captchaToken: string,
): Promise<{ success: boolean; vote_id?: string; message?: string }> {
	return callEdge('vote.cast', {
		server_id: serverId,
		captcha_token: captchaToken,
	});
}

// Public edge call — no auth required
async function callEdgePublic(
	command: string,
	payload: Record<string, unknown>,
): Promise<EdgeResponse> {
	const res = await fetch(EDGE_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ command, ...payload }),
	});
	return (await res.json()) as EdgeResponse;
}

export async function listServers(params: {
	limit?: number;
	page?: number;
	sort?: string;
	category?: number | null;
}): Promise<EdgeResponse> {
	return callEdgePublic('list.servers', params);
}

export async function submitServer(params: {
	server_id: string;
	name: string;
	summary: string;
	invite_code: string;
	captcha_token: string;
	description?: string;
	icon_url?: string;
	banner_url?: string;
	categories?: number[];
	tags?: string[];
}): Promise<{ success: boolean; server_id?: string; message?: string }> {
	return callEdge('server.submit', params);
}
