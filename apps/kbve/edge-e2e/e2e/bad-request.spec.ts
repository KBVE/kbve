import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';
import { createJwt } from './helpers/jwt';

describe('Bad Request Handling on vault-reader', () => {
	let serviceToken: string;

	beforeAll(async () => {
		await waitForReady();
		serviceToken = createJwt({ role: 'service_role' });
	});

	const headers = () => ({
		'Content-Type': 'application/json',
		Authorization: `Bearer ${serviceToken}`,
	});

	it('should return 405 for GET requests to vault-reader', async () => {
		const res = await fetch(`${BASE_URL}/vault-reader`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${serviceToken}` },
		});
		expect(res.status).toBe(405);
		const body = await res.json();
		expect(body.error).toContain('Only POST method is allowed');
	});

	it('should return 400 when command field is missing', async () => {
		const res = await fetch(`${BASE_URL}/vault-reader`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('command is required');
	});

	it('should return 400 for get command without secret_id', async () => {
		const res = await fetch(`${BASE_URL}/vault-reader`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ command: 'get' }),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('secret_id is required');
	});

	it('should return 400 for set command without secret_name/secret_value', async () => {
		const res = await fetch(`${BASE_URL}/vault-reader`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ command: 'set' }),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain(
			'secret_name and secret_value are required',
		);
	});

	it('should return 400 for an invalid command value', async () => {
		const res = await fetch(`${BASE_URL}/vault-reader`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ command: 'delete' }),
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toContain('Invalid command');
	});

	it('should return 500 for malformed JSON body', async () => {
		const res = await fetch(`${BASE_URL}/vault-reader`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${serviceToken}`,
			},
			body: '{not valid json',
		});
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.error).toContain('Internal server error');
	});
});
