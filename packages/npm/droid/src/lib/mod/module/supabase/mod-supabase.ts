import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModInitContext } from '../../../types/modules';

let supabase: SupabaseClient | null = null;
let initialized = false;

const state = {
	ctx: null as ModInitContext | null,
	url: '',
	key: '',
};

export const mod = {
	getMeta: () => ({
		name: 'supabase',
		version: '1.0.0',
		description: 'Supabase mod for async DB access',
		author: 'kbve',
	}),

	init(ctx: ModInitContext) {
		state.ctx = ctx;
	},

	async loadSupabaseClient() {
		try {
			const supabaseModule = await import(
				'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
			);
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
		if (!supabase)
			throw new Error(
				'Supabase not configured. Call `configure()` first.',
			);
		const { data, error } = await supabase.from('test').select('*');
		return { data, error };
	},

	async insertTest(payload: Record<string, unknown>) {
		if (!supabase)
			throw new Error(
				'Supabase not configured. Call `configure()` first.',
			);
		const { data, error } = await supabase
			.from('test')
			.insert(payload)
			.select();
		return { data, error };
	},
};
