/**
 * Integration tests for API functions with mocked HTTP.
 */
import { _headers, _message } from '@kbve/devops';

describe('API Integration', () => {
	describe('_headers', () => {
		it('constructs headers without auth', () => {
			const headers = _headers();
			expect(headers).toEqual({
				'Content-Type': 'application/json',
			});
		});

		it('constructs headers with auth token', () => {
			const headers = _headers('my-token');
			expect(headers).toEqual({
				'Content-Type': 'application/json',
				Authorization: 'Bearer my-token',
			});
		});
	});

	describe('_message', () => {
		it('sanitizes markdown at level 1', async () => {
			const result = await _message('# Title', 1);
			expect(typeof result).toBe('string');
			expect(result).toContain('Title');
		});

		it('sanitizes markdown at level 2', async () => {
			const result = await _message('**bold text**', 2);
			expect(typeof result).toBe('string');
		});
	});
});
