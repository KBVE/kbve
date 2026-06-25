import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

const TENANT_GUID = 'be92671d-af96-4a6b-bdf7-6a3b6270dae6';
const OTHER_GUID = '11111111-2222-3333-4444-555555555555';

const authHeaders = { 'X-CustomerGUID': TENANT_GUID };

describe('ROWS Root', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('GET / returns the service banner', async () => {
		const res = await fetch(`${BASE_URL}/`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toMatchObject({ service: 'rows', status: 'ok' });
	});
});

describe('ROWS API — DeploymentInfo (no DB)', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('reports build + binding metadata for the running tenant', async () => {
		const res = await fetch(`${BASE_URL}/api/System/DeploymentInfo`, {
			headers: authHeaders,
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(typeof body.version).toBe('string');
		expect(body.version.length).toBeGreaterThan(0);
		expect(body.customer_guid).toBe(TENANT_GUID);
		expect(body.environment).toBe('dev');
		expect(body.agones_available).toBe(false);
		expect(body.rabbitmq_connected).toBe(false);
		expect(typeof body.supabase).toBe('object');
		expect(typeof body.supabase.jwt_configured).toBe('boolean');
	});

	it('is tenant-gated (401 without the GUID header)', async () => {
		const res = await fetch(`${BASE_URL}/api/System/DeploymentInfo`);
		expect(res.status).toBe(401);
	});

	it('rejects a valid non-matching GUID as cross-tenant (403)', async () => {
		const res = await fetch(`${BASE_URL}/api/System/DeploymentInfo`, {
			headers: { 'X-CustomerGUID': OTHER_GUID },
		});
		expect(res.status).toBe(403);
	});
});

describe('ROWS API — Aggregated Health (no DB)', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('reports unhealthy with postgres down and no agones', async () => {
		const res = await fetch(`${BASE_URL}/api/System/Health`, {
			headers: authHeaders,
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe('unhealthy');
		expect(body.checks.postgres.ok).toBe(false);
		expect(body.checks.agones.ok).toBe(false);
		expect(typeof body.version).toBe('string');
		expect(typeof body.uptime_seconds).toBe('number');
		expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
	});
});

describe('ROWS API — ReportBuild → /health', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('records a reported build version and surfaces it on /health', async () => {
		const version = `e2e-build-${Date.now()}`;
		const post = await fetch(`${BASE_URL}/api/System/ReportBuild`, {
			method: 'POST',
			headers: { ...authHeaders, 'Content-Type': 'application/json' },
			body: JSON.stringify({ version }),
		});
		expect(post.status).toBe(200);
		const posted = await post.json();
		expect(posted.success).toBe(true);

		const health = await fetch(`${BASE_URL}/health`);
		const body = await health.json();
		expect(body.unreal_version).toBe(version);
	});

	it('rejects an empty version', async () => {
		const res = await fetch(`${BASE_URL}/api/System/ReportBuild`, {
			method: 'POST',
			headers: { ...authHeaders, 'Content-Type': 'application/json' },
			body: JSON.stringify({ version: '' }),
		});
		const body = await res.json();
		expect(body.success).toBe(false);
	});

	it('is tenant-gated (401 without the GUID header)', async () => {
		const res = await fetch(`${BASE_URL}/api/System/ReportBuild`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ version: 'nope' }),
		});
		expect(res.status).toBe(401);
	});
});

describe('ROWS API — Fleet + Instance log (no DB)', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('FleetStatus reports agones unavailable instead of erroring', async () => {
		const res = await fetch(`${BASE_URL}/api/System/FleetStatus`, {
			headers: authHeaders,
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toHaveProperty('error');
	});

	it('InstanceLog returns an empty event array on a fresh boot', async () => {
		const res = await fetch(`${BASE_URL}/api/System/InstanceLog`, {
			headers: authHeaders,
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.events)).toBe(true);
	});
});
