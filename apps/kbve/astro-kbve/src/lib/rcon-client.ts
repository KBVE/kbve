import { initSupa, getSupa } from './supa';

export type Game = 'mc' | 'factorio';

export interface RconExecRequest {
	command: string;
	args?: string[];
}

export interface RconExecResponse {
	ok: boolean;
	output: string;
	latency_ms: number;
	error?: string;
}

const API_BASE = '/api/v1/rcon';

async function bearerToken(): Promise<string | null> {
	await initSupa();
	const supa = getSupa();
	const result = await supa.getSession().catch(() => null);
	return (result?.session?.access_token as string | undefined) ?? null;
}

export async function execRcon(
	game: Game,
	server: string,
	body: RconExecRequest,
): Promise<RconExecResponse> {
	const token = await bearerToken();
	if (!token) {
		throw new Error('Not signed in');
	}
	const res = await fetch(
		`${API_BASE}/${encodeURIComponent(game)}/${encodeURIComponent(server)}/exec`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(body),
		},
	);

	const text = await res.text();
	let parsed: RconExecResponse | undefined;
	try {
		parsed = text ? (JSON.parse(text) as RconExecResponse) : undefined;
	} catch {
		parsed = undefined;
	}

	if (!res.ok) {
		const message =
			parsed?.error ??
			(typeof parsed?.output === 'string' ? parsed.output : undefined) ??
			text ??
			`HTTP ${res.status}`;
		return {
			ok: false,
			output: '',
			latency_ms: 0,
			error: message,
		};
	}

	return (
		parsed ?? {
			ok: false,
			output: '',
			latency_ms: 0,
			error: 'empty response',
		}
	);
}
