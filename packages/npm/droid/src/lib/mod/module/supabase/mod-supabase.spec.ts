import { describe, it, expect } from 'vitest';
import { mod } from './mod-supabase';

describe('mod-supabase', () => {
	it('should have meta info', () => {
		const meta = mod.getMeta();

		expect(meta.name).toBe('supabase');
		expect(meta.version).toBe('1.0.0');
		expect(meta.description).toBeDefined();
		expect(meta.author).toBe('kbve');
	});

	it('should accept init context', () => {
		mod.init({ test: true });
		// init stores context internally — no throw = success
	});

	it('should reject queries before configure', async () => {
		await expect(mod.queryTestTable()).rejects.toThrow('Supabase not configured');
	});

	it('should reject inserts before configure', async () => {
		await expect(mod.insertTest({ foo: 'bar' })).rejects.toThrow('Supabase not configured');
	});
});
