import { dashFetch } from '../dashFetch';
import type { RconExecRequest, RconExecResponse } from '../mc/rconExec';
import { NODE_SCOPE_DETAIL } from './commands';
import type { WowScope } from './commands';

export type { RconExecRequest };

/** `scope` mirrors the axum allowlist: whether the effect landed realm-wide or on one fleet node. */
export interface SoapExecResponse extends RconExecResponse {
	scope?: WowScope;
}

export type SoapExecFn = (
	server: string,
	body: RconExecRequest,
) => Promise<SoapExecResponse>;

/**
 * A node-scoped result is not an error, so it must not read as one — but it is
 * also not a realm-wide success, and a "player not found" may only mean the
 * command reached the wrong worldserver.
 */
export function soapResultCaveat(res: RconExecResponse): string | null {
	return (res as SoapExecResponse).scope === 'node'
		? NODE_SCOPE_DETAIL
		: null;
}

const FAIL = (error: string): SoapExecResponse => ({
	ok: false,
	output: '',
	latency_ms: 0,
	error,
});

export function createSoapExec(opts: {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
}): SoapExecFn {
	const { getToken, baseUrl = '' } = opts;
	return async (server, body) => {
		const token = await getToken().catch(() => null);
		if (!token) return FAIL('Not signed in');
		try {
			const res = await dashFetch(
				`${baseUrl}/api/v1/wow/soap/${encodeURIComponent(server)}/exec`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify(body),
					label: 'wow:soap',
				},
			);
			const text = await res.text();
			let parsed: SoapExecResponse | undefined;
			try {
				parsed = text
					? (JSON.parse(text) as SoapExecResponse)
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
