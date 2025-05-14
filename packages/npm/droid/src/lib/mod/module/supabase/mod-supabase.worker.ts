import { expose } from 'comlink';
import type { SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;
let initialized = false;

const state = {
	ctx: null as any,
	url: '',
	key: '',
};

const mod = {
	getMeta: () => ({
		name: 'supabase',
		version: '1.0.0',
		description: 'Supabase mod for async DB access',
		author: 'kbve',
	}),

	init(ctx: any) {
		state.ctx = ctx;
	},

	async loadSupabaseClient() {
		try {
			const supabaseModule = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
			console.log('[mod-supabase] Supabase module loaded');
			return supabaseModule.createClient;
		} catch (err) {
			console.error('[mod-supabase] Failed to load Supabase:', err);
			throw err;
		}
	},

	async configure(url: string, key: string) {
		if (!initialized) {
			const createClient = await this.loadSupabaseClient();
			supabase = createClient(url, key);
			state.url = url;
			state.key = key;
			initialized = true;
		}
	},

	async queryTestTable() {
		if (!supabase) throw new Error('Supabase not configured. Call `configure()` first.');
		const { data, error } = await supabase.from('test').select('*');
		return { data, error };
	},

	async insertTest(payload: Record<string, any>) {
		if (!supabase) throw new Error('Supabase not configured. Call `configure()` first.');
		const { data, error } = await supabase.from('test').insert(payload).select();
		return { data, error };
	}
};

expose(mod);
