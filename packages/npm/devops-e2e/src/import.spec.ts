/**
 * Integration tests that verify the built @kbve/devops package
 * can be imported and its exports are accessible.
 */
describe('ESM Import', () => {
	it('should export all expected functions from the barrel', async () => {
		const devops = await import('@kbve/devops');

		// Core
		expect(typeof devops.devops).toBe('function');

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

		// YouTube
		expect(typeof devops.fetchYoutubeTitle).toBe('function');
		expect(typeof devops.extractYoutubeLink).toBe('function');
		expect(typeof devops.extractYoutubeId).toBe('function');

		// GitHub Actions helpers
		expect(typeof devops._$gha_kbve_ActionProcess).toBe('function');
		expect(typeof devops._$gha_createIssueComment).toBe('function');
		expect(typeof devops._$gha_addLabel).toBe('function');
		expect(typeof devops._$gha_removeLabel).toBe('function');
	});
});
