/**
 * Integration tests for sanitization functions using real dependencies
 * (jsdom, dompurify, marked) — not mocked.
 */
import {
	_isULID,
	stripNonAlphanumeric,
	sanitizePort,
	sanitizeContainerName,
	sanitizeContainerImage,
	markdownToJsonSafeString,
	_title,
	_md_safe_row,
} from '@kbve/devops';

describe('Sanitization Integration', () => {
	describe('_isULID', () => {
		it('accepts a valid ULID', () => {
			expect(_isULID('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
		});

		it('rejects an invalid ULID', () => {
			expect(_isULID('not-a-ulid')).toBe(false);
		});
	});

	describe('markdownToJsonSafeString', () => {
		it('converts markdown to a JSON-safe plain text string', async () => {
			const result = await markdownToJsonSafeString('# Hello, World!');
			expect(result).toContain('Hello, World!');
		});

		it('strips HTML tags from markdown', async () => {
			const result = await markdownToJsonSafeString(
				'**bold** and <script>alert("xss")</script>',
			);
			expect(result).not.toContain('<script>');
			expect(result).not.toContain('alert');
		});
	});

	describe('stripNonAlphanumeric', () => {
		it('removes special characters', () => {
			expect(stripNonAlphanumeric('hello@world!')).toBe('helloworld');
		});

		it('preserves spaces and periods', () => {
			expect(stripNonAlphanumeric('hello world. test')).toBe(
				'hello world. test',
			);
		});
	});

	describe('sanitizePort', () => {
		it('accepts valid ports', () => {
			expect(sanitizePort(3000)).toBe(3000);
			expect(sanitizePort(8080)).toBe(8080);
		});

		it('rejects restricted ports', () => {
			expect(() => sanitizePort(80)).toThrow();
			expect(() => sanitizePort(443)).toThrow();
			expect(() => sanitizePort(22)).toThrow();
		});

		it('rejects out-of-range ports', () => {
			expect(() => sanitizePort(0)).toThrow();
			expect(() => sanitizePort(70000)).toThrow();
		});
	});

	describe('sanitizeContainerName', () => {
		it('accepts valid container names', () => {
			expect(sanitizeContainerName('my_container')).toBe('my_container');
		});

		it('strips invalid characters from container names', () => {
			expect(sanitizeContainerName('my-container!')).toBe('mycontainer');
		});

		it('throws for fully invalid names', () => {
			expect(() => sanitizeContainerName('---!!!')).toThrow();
		});
	});

	describe('sanitizeContainerImage', () => {
		it('accepts valid docker image names', () => {
			expect(sanitizeContainerImage('nginx:latest')).toBe('nginx:latest');
			expect(sanitizeContainerImage('ghcr.io/kbve/app:v1')).toBe(
				'ghcr.io/kbve/app:v1',
			);
		});
	});

	describe('_title', () => {
		it('cleans and truncates issue titles', () => {
			const result = _title('Hello World! This is a test title.');
			expect(result.length).toBeLessThanOrEqual(64);
			expect(typeof result).toBe('string');
		});
	});

	describe('_md_safe_row', () => {
		it('escapes markdown special characters', () => {
			const result = _md_safe_row('hello | world * [test]');
			expect(result).not.toContain('|');
			expect(result).not.toContain('*');
		});
	});
});
