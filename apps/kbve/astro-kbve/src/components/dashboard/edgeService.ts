import { atom, computed } from 'nanostores';
import { SUPABASE_URL } from '@/lib/supa';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EdgeFunctionDef {
	name: string;
	label: string;
	description: string;
}

export interface FunctionHealth {
	name: string;
	label: string;
	description: string;
	status: 'ok' | 'error' | 'pending';
	version?: string;
	latencyMs?: number;
	timestamp?: string;
	error?: string;
}

interface CachedHealth {
	functions: FunctionHealth[];
	cached_at: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EDGE_CACHE_KEY = 'cache:edge:health';
const CACHE_TTL_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function getCachedHealth(): CachedHealth | null {
	try {
		const raw = localStorage.getItem(EDGE_CACHE_KEY);
		if (!raw) return null;
		const cached: CachedHealth = JSON.parse(raw);
		if (Date.now() - cached.cached_at > CACHE_TTL_MS) return null;
		return cached;
	} catch {
		return null;
	}
}

function setCachedHealth(data: CachedHealth): void {
	try {
		localStorage.setItem(EDGE_CACHE_KEY, JSON.stringify(data));
	} catch {
		/* quota exceeded */
	}
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function checkFunctionHealth(
	fn: EdgeFunctionDef,
): Promise<FunctionHealth> {
	const url = `${SUPABASE_URL}/functions/v1/${fn.name}`;
	const start = performance.now();

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		const method = fn.name === 'health' ? 'GET' : 'OPTIONS';

		const resp = await fetch(url, {
			method,
			signal: controller.signal,
		});
		clearTimeout(timeout);

		const latencyMs = Math.round(performance.now() - start);

		if (fn.name === 'health' && resp.ok) {
			const data = await resp.json();
			return {
				...fn,
				status: 'ok',
				version: data.version,
				timestamp: data.timestamp,
				latencyMs,
			};
		}

		if (method === 'OPTIONS' && resp.ok) {
			return { ...fn, status: 'ok', latencyMs };
		}

		return {
			...fn,
			status: 'error',
			latencyMs,
			error: `HTTP ${resp.status}`,
		};
	} catch (e: unknown) {
		const latencyMs = Math.round(performance.now() - start);
		return {
			...fn,
			status: 'error',
			latencyMs,
			error:
				e instanceof Error
					? e.name === 'AbortError'
						? 'Timeout'
						: e.message
					: 'Unknown error',
		};
	}
}

async function fetchManifest(): Promise<EdgeFunctionDef[]> {
	const url = `${SUPABASE_URL}/functions/v1/health`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		const resp = await fetch(url, { signal: controller.signal });
		clearTimeout(timeout);

		if (!resp.ok) return [];

		const data = await resp.json();
		if (Array.isArray(data.functions) && data.functions.length > 0) {
			return data.functions;
		}
	} catch {
		// Health unreachable
	}

	return [];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class EdgeService {
	// Data
	public readonly $functions = atom<FunctionHealth[]>([]);
	public readonly $fromCache = atom<boolean>(false);
	public readonly $refreshing = atom<boolean>(false);
	public readonly $error = atom<string | null>(null);
	public readonly $lastChecked = atom<Date | null>(null);

	// Computed
	public readonly $okCount = computed(
		[this.$functions],
		(fns) => fns.filter((f) => f.status === 'ok').length,
	);

	public readonly $errorCount = computed(
		[this.$functions],
		(fns) => fns.filter((f) => f.status === 'error').length,
	);

	public readonly $totalCount = computed(
		[this.$functions],
		(fns) => fns.length,
	);

	// --- Actions ---

	public async fetchHealth(skipCache = false): Promise<void> {
		if (!skipCache) {
			const cached = getCachedHealth();
			if (cached) {
				this.$functions.set(cached.functions);
				this.$fromCache.set(true);
				this.$lastChecked.set(new Date(cached.cached_at));
				return;
			}
		}

		this.$refreshing.set(true);
		this.$error.set(null);
		this.$fromCache.set(false);

		try {
			const manifest = await fetchManifest();

			if (manifest.length === 0) {
				this.$error.set(
					'Could not reach the health endpoint to load function registry',
				);
				this.$functions.set([]);
				this.$refreshing.set(false);
				return;
			}

			const results = await Promise.all(
				manifest.map(checkFunctionHealth),
			);
			this.$functions.set(results);
			this.$lastChecked.set(new Date());

			setCachedHealth({
				functions: results,
				cached_at: Date.now(),
			});
		} catch (e: unknown) {
			this.$error.set(
				e instanceof Error
					? e.message
					: 'Failed to check edge function health',
			);
		} finally {
			this.$refreshing.set(false);
		}
	}

	public refresh(): void {
		if (!this.$refreshing.get()) {
			this.fetchHealth(true);
		}
	}
}

export const edgeService = new EdgeService();
