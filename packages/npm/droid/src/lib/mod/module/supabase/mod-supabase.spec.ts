import { describe, it, expect, beforeAll } from 'vitest';
import { droid } from '../../../droid';
import type { Remote } from 'comlink';
import type { ModHandle, SupabaseModAPI  } from '../../../types/modules';

console.log('[spec] Starting mod-supabase test file...');


let mod: Remote<SupabaseModAPI>;
let meta: { name: string; version: string };
describe('mod-supabase', () => {
	it('should have meta info', async () => {
		await droid();
		if (!window.kbve?.mod) {
			throw new Error('Mod manager not available');
		}

		console.log('[test] Loading Supabase mod...');
		const modURL = new URL('./mod-supabase.worker.ts', import.meta.url);
        console.log('Resolved worker URL:', modURL.href);

		const handle = await window.kbve.mod.load(modURL.href);
		const mod: Remote<SupabaseModAPI> = handle.instance;
		const meta = handle.meta;

		console.log('[test] Supabase mod loaded:', meta);
		expect(meta.name).toBe('supabase');
		expect(meta.version).toBeDefined();
	}, 30_000);
});