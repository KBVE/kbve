/**
 * @deprecated — SLATED FOR REMOVAL
 *
 * This monolithic component has been replaced by the nanostore island architecture:
 *   - edgeService.ts        → Nanostore singleton (state + API logic)
 *   - ReactEdgeHeader.tsx    → Header island (title, cache badge, refresh)
 *   - ReactEdgeSummary.tsx   → Summary bar + error banner island
 *   - ReactEdgeStatusGrid.tsx → Status card grid island
 *   - AstroEdgeDashboard.astro → Static Astro shell mounting all islands
 *
 * Remove this file once all references are confirmed migrated.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { SUPABASE_URL } from '@/lib/supa';
import {
	Activity,
	CheckCircle,
	XCircle,
	RefreshCw,
	Loader2,
	AlertCircle,
	Clock,
	Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EDGE_CACHE_KEY = 'cache:edge:health';
const CACHE_TTL_MS = 30 * 1000; // 30 seconds
const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EdgeFunctionDef {
	name: string;
	label: string;
	description: string;
}

interface FunctionHealth {
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
// Health check
// ---------------------------------------------------------------------------

async function checkFunctionHealth(
	fn: EdgeFunctionDef,
): Promise<FunctionHealth> {
	const url = `${SUPABASE_URL}/functions/v1/${fn.name}`;
	const start = performance.now();

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

		// Health is already confirmed reachable (we got the manifest from it).
		// For other functions, OPTIONS (preflight) avoids auth errors —
		// a 200 means the function is deployed and responding.
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

/** Fetch the function registry from the health endpoint. */
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
		// Health unreachable — dashboard will show empty state
	}

	return [];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusCard({ fn }: { fn: FunctionHealth }) {
	const statusColor =
		fn.status === 'ok'
			? '#22c55e'
			: fn.status === 'error'
				? '#ef4444'
				: 'var(--sl-color-gray-3, #8b949e)';

	const StatusIcon =
		fn.status === 'ok'
			? CheckCircle
			: fn.status === 'error'
				? XCircle
				: Loader2;

	return (
		<div style={styles.statusCard}>
			<div style={styles.cardHeader}>
				<StatusIcon size={18} style={{ color: statusColor }} />
				<span style={styles.cardLabel}>{fn.label}</span>
				{fn.latencyMs != null && (
					<span style={styles.latencyBadge}>{fn.latencyMs}ms</span>
				)}
			</div>
			<div style={styles.cardDescription}>{fn.description}</div>
			{fn.version && (
				<div style={styles.cardMeta}>
					<Zap size={12} />
					<span>v{fn.version}</span>
				</div>
			)}
			{fn.timestamp && (
				<div style={styles.cardMeta}>
					<Clock size={12} />
					<span>
						{new Date(fn.timestamp).toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit',
							second: '2-digit',
						})}
					</span>
				</div>
			)}
			{fn.error && <div style={styles.cardError}>{fn.error}</div>}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ReactEdgeDashboard() {
	const [functions, setFunctions] = useState<FunctionHealth[]>([]);
	const [fromCache, setFromCache] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lastChecked, setLastChecked] = useState<Date | null>(null);

	const fetchHealth = useCallback(async (skipCache = false) => {
		if (!skipCache) {
			const cached = getCachedHealth();
			if (cached) {
				setFunctions(cached.functions);
				setFromCache(true);
				setLastChecked(new Date(cached.cached_at));
				return;
			}
		}

		setRefreshing(true);
		setError(null);
		setFromCache(false);

		try {
			// Step 1: Get the function registry from the health endpoint
			const manifest = await fetchManifest();

			if (manifest.length === 0) {
				setError(
					'Could not reach the health endpoint to load function registry',
				);
				setFunctions([]);
				return;
			}

			// Step 2: Check each function's health
			const results = await Promise.all(
				manifest.map(checkFunctionHealth),
			);
			setFunctions(results);
			setLastChecked(new Date());

			setCachedHealth({
				functions: results,
				cached_at: Date.now(),
			});
		} catch (e: unknown) {
			setError(
				e instanceof Error
					? e.message
					: 'Failed to check edge function health',
			);
		} finally {
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		fetchHealth();
	}, [fetchHealth]);

	const handleRefresh = () => {
		if (!refreshing) fetchHealth(true);
	};

	const okCount = functions.filter((f) => f.status === 'ok').length;
	const errorCount = functions.filter((f) => f.status === 'error').length;
	const totalCount = functions.length;

	return (
		<div className="not-content" style={styles.dashboard}>
			{/* Header */}
			<header style={styles.header}>
				<div>
					<h1 style={styles.title}>Edge Functions</h1>
					{fromCache && <span style={styles.cacheBadge}>cached</span>}
				</div>
				<button
					onClick={handleRefresh}
					disabled={refreshing}
					style={styles.refreshButton}
					title="Refresh health checks">
					<RefreshCw
						size={18}
						style={
							refreshing
								? { animation: 'spin 1s linear infinite' }
								: undefined
						}
					/>
				</button>
			</header>

			{/* Summary bar */}
			<div style={styles.summaryBar}>
				<div style={styles.summaryItem}>
					<Activity size={16} />
					<span>
						{okCount}/{totalCount} operational
					</span>
				</div>
				{errorCount > 0 && (
					<div style={{ ...styles.summaryItem, color: '#fca5a5' }}>
						<XCircle size={16} />
						<span>
							{errorCount} {errorCount === 1 ? 'issue' : 'issues'}
						</span>
					</div>
				)}
				{lastChecked && (
					<div style={styles.summaryItem}>
						<Clock size={16} />
						<span>
							{lastChecked.toLocaleTimeString([], {
								hour: '2-digit',
								minute: '2-digit',
								second: '2-digit',
							})}
						</span>
					</div>
				)}
			</div>

			{/* Error banner */}
			{error && (
				<div style={styles.errorBanner}>
					<AlertCircle size={16} />
					<span>{error}</span>
				</div>
			)}

			{/* Status cards grid */}
			<div style={styles.statusGrid}>
				{functions.map((fn) => (
					<StatusCard key={fn.name} fn={fn} />
				))}
			</div>

			<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
	dashboard: {
		display: 'flex',
		flexDirection: 'column',
		gap: '1.5rem',
	},
	header: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	title: {
		color: 'var(--sl-color-text, #e6edf3)',
		margin: 0,
		fontSize: '1.5rem',
		fontWeight: 700,
		display: 'inline',
	},
	cacheBadge: {
		marginLeft: '0.75rem',
		padding: '2px 8px',
		borderRadius: '4px',
		background: 'var(--sl-color-gray-6, #1c1c1c)',
		color: 'var(--sl-color-gray-3, #8b949e)',
		fontSize: '0.7rem',
		fontWeight: 500,
		textTransform: 'uppercase' as const,
		letterSpacing: '0.05em',
	},
	refreshButton: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: '36px',
		height: '36px',
		borderRadius: '8px',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		background: 'transparent',
		color: 'var(--sl-color-text, #e6edf3)',
		cursor: 'pointer',
		transition: 'border-color 0.2s',
	},
	summaryBar: {
		display: 'flex',
		alignItems: 'center',
		gap: '1.5rem',
		padding: '0.75rem 1rem',
		borderRadius: 10,
		background: 'var(--sl-color-bg-nav, #111)',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		fontSize: '0.85rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
		flexWrap: 'wrap',
	},
	summaryItem: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.4rem',
	},
	errorBanner: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
		padding: '0.75rem 1rem',
		borderRadius: '8px',
		background: 'rgba(239,68,68,0.1)',
		border: '1px solid rgba(239,68,68,0.3)',
		color: '#fca5a5',
		fontSize: '0.875rem',
	},
	statusGrid: {
		display: 'grid',
		gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
		gap: '1rem',
	},
	statusCard: {
		display: 'flex',
		flexDirection: 'column',
		gap: '0.5rem',
		padding: '1.25rem',
		borderRadius: '12px',
		border: '1px solid var(--sl-color-gray-5, #262626)',
		background: 'var(--sl-color-bg-nav, #111)',
	},
	cardHeader: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
	},
	cardLabel: {
		color: 'var(--sl-color-text, #e6edf3)',
		fontWeight: 600,
		fontSize: '1rem',
		flex: 1,
	},
	latencyBadge: {
		padding: '2px 6px',
		borderRadius: '4px',
		background: 'var(--sl-color-gray-6, #1c1c1c)',
		color: 'var(--sl-color-gray-3, #8b949e)',
		fontSize: '0.7rem',
		fontWeight: 500,
		fontVariantNumeric: 'tabular-nums',
	},
	cardDescription: {
		color: 'var(--sl-color-gray-3, #8b949e)',
		fontSize: '0.8rem',
	},
	cardMeta: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.35rem',
		color: 'var(--sl-color-gray-4, #6b7280)',
		fontSize: '0.75rem',
	},
	cardError: {
		color: '#fca5a5',
		fontSize: '0.75rem',
		padding: '4px 8px',
		borderRadius: '4px',
		background: 'rgba(239,68,68,0.1)',
	},
};
