import { describe, it, expect } from 'vitest';
import { base64ToBytes } from './terminal-codec';

describe('base64ToBytes', () => {
	it('decodes ascii text', () => {
		const bytes = base64ToBytes(btoa('hello world'));
		expect(new TextDecoder().decode(bytes)).toBe('hello world');
	});

	it('round-trips all binary byte values 0-255', () => {
		const original = new Uint8Array(256);
		for (let i = 0; i < 256; i++) original[i] = i;
		let binary = '';
		for (const b of original) binary += String.fromCharCode(b);
		const b64 = btoa(binary);

		const bytes = base64ToBytes(b64);

		expect(bytes).toEqual(original);
	});

	it('decodes an empty string to an empty array', () => {
		const bytes = base64ToBytes('');
		expect(bytes).toEqual(new Uint8Array(0));
	});
});
