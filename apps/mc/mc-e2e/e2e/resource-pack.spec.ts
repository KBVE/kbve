import { describe, it, expect } from 'vitest';

const MC_HOST = process.env['MC_HOST'] ?? '127.0.0.1';
const PACK_PORT = Number(process.env['MC_PACK_PORT'] ?? 8080);
const PACK_PATH = '/kbve-resource-pack.zip';

describe('MC Resource Pack HTTP Server', () => {
	it('should serve the resource pack as a ZIP file', async () => {
		const url = `http://${MC_HOST}:${PACK_PORT}${PACK_PATH}`;
		const res = await fetch(url);

		expect(res.ok).toBe(true);
		expect(res.status).toBe(200);

		const contentType = res.headers.get('content-type');
		expect(contentType).toContain('application/zip');

		const body = await res.arrayBuffer();
		expect(body.byteLength).toBeGreaterThan(0);

		// Validate ZIP magic bytes (PK\x03\x04)
		const header = new Uint8Array(body, 0, 4);
		expect(header[0]).toBe(0x50); // P
		expect(header[1]).toBe(0x4b); // K
		expect(header[2]).toBe(0x03);
		expect(header[3]).toBe(0x04);
	});

	it('should return 404 for unknown paths', async () => {
		const url = `http://${MC_HOST}:${PACK_PORT}/nonexistent`;
		const res = await fetch(url);

		expect(res.ok).toBe(false);
	});
});
