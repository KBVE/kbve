import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt } from './helpers/jwt';

/**
 * Dashboard proxy tests — verify graceful degradation when upstream
 * services (K8s, Grafana, ArgoCD, etc.) are not configured. These
 * routes require staff JWT with DASHBOARD_VIEW permission. Without
 * a real Supabase backend the JWT will be rejected, so we test both
 * the auth gate (401/403) and the "not configured" path (503).
 */

const DASHBOARD_PROXIES = [
	{ path: '/dashboard/grafana/proxy/', label: 'Grafana' },
	{ path: '/dashboard/argo/proxy/', label: 'ArgoCD' },
	{ path: '/dashboard/vm/proxy/', label: 'KubeVirt' },
	{ path: '/dashboard/kasm/proxy/', label: 'KASM' },
	{ path: '/dashboard/guac/proxy/', label: 'Guacamole' },
	{ path: '/dashboard/edge/proxy/', label: 'Edge' },
	{ path: '/dashboard/chuckrpg/proxy/', label: 'ChuckRPG' },
	{ path: '/dashboard/clickhouse/proxy/', label: 'ClickHouse' },
	{ path: '/dashboard/forgejo/proxy/', label: 'Forgejo' },
] as const;

describe('Dashboard proxy auth gate', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	for (const { path, label } of DASHBOARD_PROXIES) {
		describe(label, () => {
			it(`rejects unauthenticated requests to ${path}`, async () => {
				const res = await fetch(`${BASE_URL}${path}`);
				// 401/403 if route registered, 404 if proxy not initialized
				// (routes aren't registered when upstream env vars are missing)
				expect([401, 403, 404]).toContain(res.status);
			});

			it(`rejects invalid JWT on ${path}`, async () => {
				const token = createJwt({ role: 'anon' });
				const res = await fetch(`${BASE_URL}${path}`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				// 401/403 auth rejected, 404 proxy not configured, 503 upstream down
				expect([401, 403, 404, 503]).toContain(res.status);
			});
		});
	}
});

describe('KASM-specific endpoints', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('GET /dashboard/kasm/workspaces rejects without auth', async () => {
		const res = await fetch(`${BASE_URL}/dashboard/kasm/workspaces`);
		expect([401, 403, 404]).toContain(res.status);
	});

	it('PUT /dashboard/kasm/scale/test rejects without auth', async () => {
		const res = await fetch(`${BASE_URL}/dashboard/kasm/scale/test`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ replicas: 1 }),
		});
		expect([401, 403, 404]).toContain(res.status);
	});
});
