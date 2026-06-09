import { describe, it, expect } from 'vitest';
import { validateUsername } from './KbveUsernameSetup';

describe('validateUsername', () => {
	it('accepts valid handles', () => {
		expect(validateUsername('h0lybyte')).toBeNull();
		expect(validateUsername('abc')).toBeNull();
		expect(validateUsername('a_b_2')).toBeNull();
	});
	it('rejects too short / too long', () => {
		expect(validateUsername('ab')).toMatch(/3 characters/);
		expect(validateUsername('a'.repeat(25))).toMatch(/24 characters/);
	});
	it('rejects bad start + bad chars', () => {
		expect(validateUsername('1abc')).toMatch(/start with a letter/);
		expect(validateUsername('ab-cd')).toMatch(/letters, numbers/);
	});
});
