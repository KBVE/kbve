import { create } from 'zustand';
import {
	fetchKbveBalance,
	fetchKbveProfile,
	type KbveBalance,
	type KbveProfile,
} from '../lib/kbveProfile';

const CACHE_KEY = 'cache:kbve-profile';
const CACHE_TTL_MS = 5 * 60 * 1000;
const BALANCE_CACHE_KEY = 'cache:kbve-balance';
const BALANCE_CACHE_TTL_MS = 60 * 1000;

interface CacheEnvelope {
	profile: KbveProfile;
	cached_at: number;
}

interface BalanceEnvelope {
	balance: KbveBalance;
	cached_at: number;
}

function readCache(): CacheEnvelope | null {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as CacheEnvelope;
		if (!parsed?.profile?.user_id) return null;
		return parsed;
	} catch {
		return null;
	}
}

function writeCache(profile: KbveProfile) {
	try {
		localStorage.setItem(
			CACHE_KEY,
			JSON.stringify({ profile, cached_at: Date.now() }),
		);
	} catch {
		// best-effort cache
	}
}

function readBalanceCache(): BalanceEnvelope | null {
	try {
		const raw = localStorage.getItem(BALANCE_CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as BalanceEnvelope;
		if (!parsed?.balance?.account_id) return null;
		return parsed;
	} catch {
		return null;
	}
}

function writeBalanceCache(balance: KbveBalance) {
	try {
		localStorage.setItem(
			BALANCE_CACHE_KEY,
			JSON.stringify({ balance, cached_at: Date.now() }),
		);
	} catch {
		// best-effort cache
	}
}

interface KbveProfileStore {
	profile: KbveProfile | null;
	balance: KbveBalance | null;
	loading: boolean;
	/** Serve cache immediately, refresh from the api when stale or forced. */
	load: (token: string, force?: boolean) => Promise<void>;
	loadBalance: (token: string, force?: boolean) => Promise<void>;
	clear: () => void;
}

export const useKbveProfileStore = create<KbveProfileStore>((set, get) => ({
	profile: readCache()?.profile ?? null,
	balance: readBalanceCache()?.balance ?? null,
	loading: false,

	load: async (token, force = false) => {
		const cached = readCache();
		if (cached && get().profile?.user_id !== cached.profile.user_id) {
			set({ profile: cached.profile });
		}
		const stale = !cached || Date.now() - cached.cached_at > CACHE_TTL_MS;
		if (!force && !stale) return;
		if (get().loading) return;

		set({ loading: true });
		try {
			const profile = await fetchKbveProfile(token);
			if (profile) {
				writeCache(profile);
				set({ profile });
			}
		} finally {
			set({ loading: false });
		}
	},

	loadBalance: async (token, force = false) => {
		const cached = readBalanceCache();
		if (cached && !get().balance) {
			set({ balance: cached.balance });
		}
		const stale =
			!cached || Date.now() - cached.cached_at > BALANCE_CACHE_TTL_MS;
		if (!force && !stale) return;

		const balance = await fetchKbveBalance(token);
		if (balance) {
			writeBalanceCache(balance);
			set({ balance });
		}
	},

	clear: () => {
		try {
			localStorage.removeItem(CACHE_KEY);
			localStorage.removeItem(BALANCE_CACHE_KEY);
		} catch {
			// ignore
		}
		set({ profile: null, balance: null });
	},
}));
