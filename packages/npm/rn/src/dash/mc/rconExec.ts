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

export type RconExecFn = (
	server: string,
	body: RconExecRequest,
) => Promise<RconExecResponse>;

const FAIL = (error: string): RconExecResponse => ({
	ok: false,
	output: '',
	latency_ms: 0,
	error,
});

export function createRconExec(opts: {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}): RconExecFn {
	const { getToken, baseUrl = '' } = opts;
	return async (server, body) => {
		const token = await getToken().catch(() => null);
		if (!token) return FAIL('Not signed in');
		try {
			const res = await fetch(
				`${baseUrl}/api/v1/rcon/mc/${encodeURIComponent(server)}/exec`,
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
				parsed = text
					? (JSON.parse(text) as RconExecResponse)
					: undefined;
			} catch {
				parsed = undefined;
			}
			if (!res.ok) {
				return FAIL(
					parsed?.error ??
						(parsed?.output || undefined) ??
						(text || `HTTP ${res.status}`),
				);
			}
			return parsed ?? FAIL('empty response');
		} catch (e) {
			return FAIL(e instanceof Error ? e.message : 'request failed');
		}
	};
}
