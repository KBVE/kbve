/**
 * Integration tests that verify the built @kbve/devops package
 * can be imported and its exports are accessible.
 *
 * The top-level barrel only re-exports browser-safe modules so
 * Astro/Vite consumers can pull `kbveApi` etc. without dragging
 * Node-only deps (jsdom, child_process, fs) into client bundles.
 * Server-only helpers (yt, github actions, codegen) live behind
 * deep imports.
 */
describe('ESM Import', () => {
	it('should export browser-safe functions from the top-level barrel', async () => {
		const devops = await import('@kbve/devops');

		// Sanitization
		expect(typeof devops._isULID).toBe('function');
		expect(typeof devops.markdownToJsonSafeString).toBe('function');
		expect(typeof devops.stripNonAlphanumeric).toBe('function');
		expect(typeof devops.sanitizePort).toBe('function');
		expect(typeof devops.sanitizeContainerName).toBe('function');
		expect(typeof devops.sanitizeContainerImage).toBe('function');

		// API
		expect(typeof devops._prompt).toBe('function');
		expect(typeof devops._headers).toBe('function');
		expect(typeof devops._post).toBe('function');
		expect(typeof devops._message).toBe('function');
		expect(typeof devops._groq).toBe('function');

		// KBVE typed client
		expect(typeof devops.createKbveClient).toBe('function');
	});

	it('should expose server-only helpers via deep source imports', async () => {
		const yt = await import('../../devops/src/lib/client/yt');
		expect(typeof yt.fetchYoutubeTitle).toBe('function');
		expect(typeof yt.extractYoutubeLink).toBe('function');
		expect(typeof yt.extractYoutubeId).toBe('function');

		const gh = await import('../../devops/src/lib/client/github');
		expect(typeof gh._$gha_kbve_ActionProcess).toBe('function');
		expect(typeof gh._$gha_createIssueComment).toBe('function');
		expect(typeof gh._$gha_addLabel).toBe('function');
		expect(typeof gh._$gha_removeLabel).toBe('function');
	});
});
