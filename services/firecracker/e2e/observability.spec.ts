import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

/**
 * Surfaces nothing else in the suite touched: the Prometheus exposition that
 * the ServiceMonitor scrapes, the OpenAPI document the staff dashboard
 * renders, the pricing quote, and the 503 contract that every /fc/* route is
 * supposed to honour on the ephemeral deployment.
 */
describe('Observability and metadata', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('serves Prometheus exposition with a TYPE line per metric', async () => {
		const res = await fetch(`${BASE_URL}/metrics`);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/plain; version=0.0.4');

		const body = await res.text();
		expect(body).toContain('fc_build_info{version=');
		expect(body).toContain('fc_jailer_enabled 0'); // FC_USE_JAILER=false
		expect(body).toContain('fc_persistent_enabled 0'); // ephemeral deployment

		// A series emitted without its TYPE line is silently dropped by some
		// scrapers, so check the pairing rather than just the presence.
		const series = new Set(
			body
				.split('\n')
				.filter((l) => l && !l.startsWith('#'))
				.map((l) => l.split(/[{ ]/)[0]),
		);
		const typed = new Set(
			body
				.split('\n')
				.filter((l) => l.startsWith('# TYPE '))
				.map((l) => l.split(' ')[2]),
		);
		for (const name of series) {
			expect(typed, `${name} emitted without a # TYPE line`).toContain(name);
		}
	});

	it('serves an OpenAPI document covering the ephemeral routes', async () => {
		const res = await fetch(`${BASE_URL}/openapi.json`);
		expect(res.status).toBe(200);

		const spec = await res.json();
		expect(spec.openapi).toMatch(/^3\./);
		for (const path of ['/vm/create', '/vm/{vm_id}', '/vm/quote', '/fc/deploy']) {
			expect(Object.keys(spec.paths)).toContain(path);
		}
		expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
	});

	it('quotes a VM without creating one', async () => {
		const before = await (await fetch(`${BASE_URL}/vm`)).json();

		const res = await fetch(`${BASE_URL}/vm/quote`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vcpu_count: 2,
				mem_size_mib: 512,
				duration_secs: 60,
				expected_requests: 1000,
			}),
		});
		expect(res.status).toBe(200);

		const quote = await res.json();
		expect(quote.estimated_duration_secs).toBe(60);
		expect(quote.estimated_requests).toBe(1000);
		expect(quote.estimated_total).toBe(
			quote.upfront +
				quote.credits_per_sec * 60 +
				quote.credits_per_1k_requests,
		);

		const after = await (await fetch(`${BASE_URL}/vm`)).json();
		expect(after.count).toBe(before.count);
	});

	it('reports every /fc/* route as unavailable on the ephemeral build', async () => {
		for (const [method, path] of [
			['GET', '/fc/nope'],
			['GET', '/fc/nope/logs'],
			['DELETE', '/fc/nope'],
		] as Array<[string, string]>) {
			const res = await fetch(`${BASE_URL}${path}`, { method });
			expect(res.status, `${method} ${path}`).toBe(503);
			expect((await res.json()).error).toBeDefined();
		}

		// Deploy validates its body before it reports the feature off, so this
		// one needs a request that would otherwise be accepted.
		const deploy = await fetch(`${BASE_URL}/fc/deploy`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: 'obs-probe',
				rootfs: 'alpine-minimal',
				entrypoint: '/bin/sh',
				http_port: 8080,
			}),
		});
		expect(deploy.status).toBe(503);
		expect((await deploy.json()).hint).toBeDefined();

		// /fc/list answers 200 with an empty registry rather than 503.
		const list = await fetch(`${BASE_URL}/fc/list`);
		expect(list.status).toBe(200);
	});
});
