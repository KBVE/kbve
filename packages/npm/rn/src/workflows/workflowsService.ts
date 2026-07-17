import type { Backend } from './types';

export interface ServiceConfig {
	baseUrl: string;
	getToken: () => Promise<string | null>;
	supabaseUrl?: string;
}

const POLL_MS = 1500;
const POLL_MAX = 40;

async function authHeaders(
	cfg: ServiceConfig,
): Promise<Record<string, string>> {
	const token = await cfg.getToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
}

async function invokeEdge(
	ref: string,
	cfg: ServiceConfig,
): Promise<{ ok: boolean; body: string }> {
	const resp = await fetch(`${cfg.baseUrl}/dashboard/edge/proxy/${ref}`, {
		method: 'POST',
		headers: await authHeaders(cfg),
	});
	return { ok: resp.ok, body: await resp.text() };
}

async function invokeFirecracker(
	ref: string,
	cfg: ServiceConfig,
): Promise<{ ok: boolean; body: string }> {
	const resp = await fetch(
		`${cfg.baseUrl}/dashboard/firecracker/proxy/${ref}`,
		{
			method: 'POST',
			headers: await authHeaders(cfg),
		},
	);
	return { ok: resp.ok, body: await resp.text() };
}

const WM = (cfg: ServiceConfig) =>
	`${cfg.baseUrl}/dashboard/workflows/proxy/api/w/kbve`;

async function invokeWindmill(
	ref: string,
	cfg: ServiceConfig,
): Promise<{ ok: boolean; body: string }> {
	const headers = await authHeaders(cfg);
	const runResp = await fetch(`${WM(cfg)}/jobs/run/p/${ref}`, {
		method: 'POST',
		headers: { ...headers, 'Content-Type': 'application/json' },
		body: '{}',
	});
	if (!runResp.ok) return { ok: false, body: await runResp.text() };
	const jobId = (await runResp.text()).trim().replace(/^"|"$/g, '');

	for (let i = 0; i < POLL_MAX; i++) {
		const poll = await fetch(
			`${WM(cfg)}/jobs_u/completed/get_result_maybe/${jobId}`,
			{ headers },
		);
		if (poll.ok) {
			const data = await poll.json().catch(() => null);
			if (data && data.completed) {
				const success = data.success !== false;
				return {
					ok: success,
					body: JSON.stringify(data.result ?? data),
				};
			}
		}
		await new Promise((r) => setTimeout(r, POLL_MS));
	}
	return {
		ok: false,
		body: `windmill job ${jobId} did not complete in time`,
	};
}

export async function invokeNode(
	backend: Backend,
	ref: string,
	cfg: ServiceConfig,
): Promise<{ ok: boolean; body: string }> {
	if (backend === 'edge') return invokeEdge(ref, cfg);
	if (backend === 'firecracker') return invokeFirecracker(ref, cfg);
	return invokeWindmill(ref, cfg);
}

export async function listWindmillScripts(
	cfg: ServiceConfig,
): Promise<string[]> {
	const resp = await fetch(`${WM(cfg)}/scripts/list`, {
		headers: await authHeaders(cfg),
	});
	if (!resp.ok) return [];
	const rows = (await resp.json().catch(() => [])) as Array<{
		path?: string;
	}>;
	return rows.map((r) => r.path ?? '').filter(Boolean);
}
