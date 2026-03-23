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

export type CheckMode = 'proxy' | 'direct';

export interface FunctionHealth {
	name: string;
	label: string;
	description: string;
	proxyStatus: 'ok' | 'error' | 'pending';
	proxyLatencyMs?: number;
	proxyError?: string;
	directStatus: 'ok' | 'error' | 'pending';
	directLatencyMs?: number;
	directError?: string;
	version?: string;
	timestamp?: string;
}

interface CachedHealth {
	functions: FunctionHealth[];
	cached_at: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EDGE_CACHE_KEY = 'cache:edge:health-v2';
const CACHE_TTL_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 2000;
const PROXY_BASE = '/dashboard/edge/proxy';

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
// Fetch with retry
// ---------------------------------------------------------------------------

async function fetchWithRetry(
	url: string,
	opts: RequestInit,
	retries = 1,
): Promise<Response> {
	for (let i = 0; i <= retries; i++) {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				FETCH_TIMEOUT_MS,
			);
			const resp = await fetch(url, {
				...opts,
				signal: controller.signal,
			});
			clearTimeout(timeout);
			return resp;
		} catch (e) {
			if (i < retries) {
				await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
				continue;
			}
			throw e;
		}
	}
	throw new Error('unreachable');
}

// ---------------------------------------------------------------------------
// Check helpers — one for proxy, one for direct
// ---------------------------------------------------------------------------

async function checkViaProxy(
	fn: EdgeFunctionDef,
	token: string,
): Promise<
	Pick<
		FunctionHealth,
		| 'proxyStatus'
		| 'proxyLatencyMs'
		| 'proxyError'
		| 'version'
		| 'timestamp'
	>
> {
	const url = `${PROXY_BASE}/${fn.name}`;
	const start = performance.now();

	try {
		const method = fn.name === 'health' ? 'GET' : 'OPTIONS';
		const resp = await fetchWithRetry(url, {
			method,
			headers: { Authorization: `Bearer ${token}` },
		});
		const latencyMs = Math.round(performance.now() - start);

		if (fn.name === 'health' && resp.ok) {
			const data = await resp.json();
			return {
				proxyStatus: 'ok',
				proxyLatencyMs: latencyMs,
				version: data.version,
				timestamp: data.timestamp,
			};
		}

		if (resp.ok) {
			return { proxyStatus: 'ok', proxyLatencyMs: latencyMs };
		}

		return {
			proxyStatus: 'error',
			proxyLatencyMs: latencyMs,
			proxyError: `HTTP ${resp.status}`,
		};
	} catch (e: unknown) {
		return {
			proxyStatus: 'error',
			proxyLatencyMs: Math.round(performance.now() - start),
			proxyError:
				e instanceof Error
					? e.name === 'AbortError'
						? 'Timeout'
						: e.message
					: 'Unknown error',
		};
	}
}

async function checkViaDirect(
	fn: EdgeFunctionDef,
): Promise<
	Pick<FunctionHealth, 'directStatus' | 'directLatencyMs' | 'directError'>
> {
	const url = `${SUPABASE_URL}/functions/v1/${fn.name}`;
	const start = performance.now();

	try {
		const method = fn.name === 'health' ? 'GET' : 'OPTIONS';
		const resp = await fetchWithRetry(url, { method });
		const latencyMs = Math.round(performance.now() - start);

		if (resp.ok) {
			return { directStatus: 'ok', directLatencyMs: latencyMs };
		}

		return {
			directStatus: 'error',
			directLatencyMs: latencyMs,
			directError: `HTTP ${resp.status}`,
		};
	} catch (e: unknown) {
		return {
			directStatus: 'error',
			directLatencyMs: Math.round(performance.now() - start),
			directError:
				e instanceof Error
					? e.name === 'AbortError'
						? 'Timeout'
						: e.message
					: 'Unknown error',
		};
	}
}

// ---------------------------------------------------------------------------
// Manifest fetcher — try proxy first, fallback to direct
// ---------------------------------------------------------------------------

async function fetchManifest(token: string | null): Promise<EdgeFunctionDef[]> {
	// Try proxy first (more reliable, cluster-internal)
	if (token) {
		try {
			const resp = await fetchWithRetry(`${PROXY_BASE}/health`, {
				method: 'GET',
				headers: { Authorization: `Bearer ${token}` },
			});
			if (resp.ok) {
				const data = await resp.json();
				if (
					Array.isArray(data.functions) &&
					data.functions.length > 0
				) {
					return data.functions;
				}
			}
		} catch {
			// fall through to direct
		}
	}

	// Direct fallback
	try {
		const resp = await fetchWithRetry(
			`${SUPABASE_URL}/functions/v1/health`,
			{ method: 'GET' },
		);
		if (resp.ok) {
			const data = await resp.json();
			if (Array.isArray(data.functions) && data.functions.length > 0) {
				return data.functions;
			}
		}
	} catch {
		// both failed
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
	public readonly $accessToken = atom<string | null>(null);

	// Computed — overall status uses proxy as primary, direct as secondary
	public readonly $okCount = computed(
		[this.$functions],
		(fns) =>
			fns.filter((f) => f.proxyStatus === 'ok' || f.directStatus === 'ok')
				.length,
	);

	public readonly $errorCount = computed(
		[this.$functions],
		(fns) =>
			fns.filter(
				(f) => f.proxyStatus === 'error' && f.directStatus === 'error',
			).length,
	);

	public readonly $totalCount = computed(
		[this.$functions],
		(fns) => fns.length,
	);

	public readonly $proxyOkCount = computed(
		[this.$functions],
		(fns) => fns.filter((f) => f.proxyStatus === 'ok').length,
	);

	public readonly $directOkCount = computed(
		[this.$functions],
		(fns) => fns.filter((f) => f.directStatus === 'ok').length,
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

		const token = this.$accessToken.get();

		try {
			const manifest = await fetchManifest(token);

			if (manifest.length === 0) {
				this.$error.set(
					'Could not reach the health endpoint to load function registry',
				);
				this.$functions.set([]);
				this.$refreshing.set(false);
				return;
			}

			// Run proxy and direct checks in parallel for each function
			const results = await Promise.all(
				manifest.map(async (fn) => {
					const [proxyResult, directResult] = await Promise.all([
						token
							? checkViaProxy(fn, token)
							: Promise.resolve({
									proxyStatus: 'pending' as const,
									proxyError: 'Not authenticated',
								}),
						checkViaDirect(fn),
					]);

					return {
						...fn,
						...proxyResult,
						...directResult,
					} as FunctionHealth;
				}),
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
