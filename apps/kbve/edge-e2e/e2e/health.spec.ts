import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt } from './helpers/jwt';

/** Parse version from deno.json and function registry from version.toml. */
function parseManifest() {
	const denoJson = JSON.parse(
		readFileSync(resolve(__dirname, '../../edge/deno.json'), 'utf-8'),
	);
	const version: string = denoJson.version;
	if (!version) throw new Error('Could not parse version from deno.json');

	const tomlContent = readFileSync(
		resolve(__dirname, '../../edge/version.toml'),
		'utf-8',
	);
	const functionNames: string[] = [];
	const blocks = tomlContent.split(/\[\[functions\]\]/g).slice(1);
	for (const block of blocks) {
		const name = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
		if (name) functionNames.push(name);
	}

	return { version, functionNames };
}

describe('Edge Runtime Health', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	it('should be reachable and respond to HTTP requests', async () => {
		const res = await fetch(BASE_URL);
		expect([400, 401]).toContain(res.status);
	});

	it('should return 400 with valid JWT but no function name', async () => {
		const token = createJwt();
		const res = await fetch(BASE_URL, {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.msg).toContain('missing function name in request');
	});

	it('should return health and version JSON without auth', async () => {
		const res = await fetch(`${BASE_URL}/health`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe('ok');
		expect(body.version).toBeDefined();
		expect(body.timestamp).toBeDefined();
	});

	it('should return version matching deno.json', async () => {
		const { version } = parseManifest();
		const res = await fetch(`${BASE_URL}/health`);
		const body = await res.json();
		expect(body.version).toBe(version);
	});

	it('should return functions array matching version.toml registry', async () => {
		const { functionNames } = parseManifest();
		const res = await fetch(`${BASE_URL}/health`);
		const body = await res.json();
		expect(Array.isArray(body.functions)).toBe(true);
		const returnedNames = body.functions.map(
			(f: { name: string }) => f.name,
		);
		expect(returnedNames).toEqual(functionNames);
	});

	it('should return a valid ISO timestamp in health response', async () => {
		const res = await fetch(`${BASE_URL}/health`);
		const body = await res.json();
		const parsed = new Date(body.timestamp);
		expect(parsed.getTime()).not.toBeNaN();
	});
});
