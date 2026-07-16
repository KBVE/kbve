import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import type { BadgeTone } from '../_ui';
import { createStreamSource } from '../createStreamSource';
import type { StreamLens, StreamStore } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawEdgeFunction {
	name: string;
	label: string;
	description: string;
	version?: string;
	timestamp?: string;
}

export type CheckStatus = 'ok' | 'error' | 'pending';

export interface EdgeFunctionItem {
	name: string;
	label: string;
	description: string;
	proxyStatus: CheckStatus;
	proxyLatencyMs?: number;
	proxyError?: string;
	directStatus: CheckStatus;
	directLatencyMs?: number;
	directError?: string;
	version?: string;
	timestamp?: string;
}

export interface EdgeStreamOptions {
	/** Returns a fresh bearer token (Supabase access token). */
	getToken: () => Promise<string | null>;
	/** Origin for the proxy. '' (relative) on web, absolute URL on mobile. */
	baseUrl?: string;
	/** Supabase URL for direct checks. */
	supabaseUrl?: string;
	pollMs?: number;
}

// ---------------------------------------------------------------------------
// Fetch with retry
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 2000;

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
// Check helpers
// ---------------------------------------------------------------------------

async function checkViaProxy(
	fn: RawEdgeFunction,
	baseUrl: string,
	token: string,
): Promise<
	Pick<
		EdgeFunctionItem,
		| 'proxyStatus'
		| 'proxyLatencyMs'
		| 'proxyError'
		| 'version'
		| 'timestamp'
	>
> {
	const url = `${baseUrl}/dashboard/edge/proxy/${fn.name}`;
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
	fn: RawEdgeFunction,
	supabaseUrl: string,
): Promise<
	Pick<EdgeFunctionItem, 'directStatus' | 'directLatencyMs' | 'directError'>
> {
	const url = `${supabaseUrl}/functions/v1/${fn.name}`;
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
// Normalization
// ---------------------------------------------------------------------------

async function fetchAndNormalize(
	baseUrl: string,
	supabaseUrl: string,
	token: string | null,
	signal?: AbortSignal,
): Promise<EdgeFunctionItem[]> {
	// Fetch manifest from proxy health endpoint (with fallback to direct)
	let manifest: RawEdgeFunction[] = [];

	if (token) {
		try {
			const resp = await fetchWithRetry(
				`${baseUrl}/dashboard/edge/proxy/health`,
				{
					method: 'GET',
					headers: { Authorization: `Bearer ${token}` },
				},
			);
			if (resp.ok) {
				const data = await resp.json();
				if (
					Array.isArray(data.functions) &&
					data.functions.length > 0
				) {
					manifest = data.functions;
				}
			}
		} catch {
			// fall through to direct
		}
	}

	// Direct fallback
	if (manifest.length === 0) {
		try {
			const resp = await fetchWithRetry(
				`${supabaseUrl}/functions/v1/health`,
				{ method: 'GET' },
			);
			if (resp.ok) {
				const data = await resp.json();
				if (
					Array.isArray(data.functions) &&
					data.functions.length > 0
				) {
					manifest = data.functions;
				}
			}
		} catch {
			// both failed
		}
	}

	if (manifest.length === 0) {
		throw new Error('Could not load edge function manifest');
	}

	// Check each function via proxy and direct in parallel
	const results = await Promise.all(
		manifest.map(async (fn) => {
			const [proxyResult, directResult] = await Promise.all([
				token
					? checkViaProxy(fn, baseUrl, token)
					: Promise.resolve({
							proxyStatus: 'pending' as const,
							proxyError: 'Not authenticated',
						}),
				checkViaDirect(fn, supabaseUrl),
			]);

			return {
				name: fn.name,
				label: fn.label,
				description: fn.description,
				...proxyResult,
				...directResult,
			} as EdgeFunctionItem;
		}),
	);

	return results;
}

// ---------------------------------------------------------------------------
// Stream Source
// ---------------------------------------------------------------------------

export function createEdgeStream(
	opts: EdgeStreamOptions,
): StreamStore<EdgeFunctionItem> {
	const {
		getToken,
		baseUrl = '',
		supabaseUrl = 'https://tuvgtboikznqvlhtkwzq.supabase.co',
		pollMs = 30_000,
	} = opts;

	return createStreamSource<EdgeFunctionItem, EdgeFunctionItem>({
		key: 'edge:functions',
		pollMs,
		cacheTtlMs: 30_000,
		id: (it) => it.name,
		signature: (it) =>
			`${it.proxyStatus}|${it.directStatus}|${it.proxyLatencyMs}|${it.directLatencyMs}`,
		normalize: (x) => x as EdgeFunctionItem, // Already normalized in fetch
		fetch: async ({ signal }) => {
			const token = await getToken();
			return fetchAndNormalize(baseUrl, supabaseUrl, token, signal);
		},
	});
}

// ---------------------------------------------------------------------------
// Lens
// ---------------------------------------------------------------------------

function statusTone(status: CheckStatus): BadgeTone {
	if (status === 'ok') return 'success';
	if (status === 'error') return 'danger';
	return 'neutral';
}

function statusColor(status: CheckStatus): string {
	if (status === 'ok') return tokens.color.success;
	if (status === 'error') return tokens.color.danger;
	return tokens.color.textFaint;
}

function overallStatus(it: EdgeFunctionItem): CheckStatus {
	// Overall status is OK if either proxy or direct is OK
	if (it.proxyStatus === 'ok' || it.directStatus === 'ok') return 'ok';
	if (it.proxyStatus === 'error' && it.directStatus === 'error')
		return 'error';
	return 'pending';
}

export const edgeLens: StreamLens<EdgeFunctionItem> = {
	searchText: (it) => `${it.name} ${it.label} ${it.description}`,
	group: () => 'Edge Functions',
	filters: [
		{
			id: 'ok',
			label: 'Healthy',
			tone: 'success',
			predicate: (it) => overallStatus(it) === 'ok',
		},
		{
			id: 'error',
			label: 'Error',
			tone: 'danger',
			predicate: (it) => overallStatus(it) === 'error',
		},
		{
			id: 'pending',
			label: 'Pending',
			tone: 'neutral',
			predicate: (it) => overallStatus(it) === 'pending',
		},
	],
	stats: (items) => [
		{ id: 'total', label: 'Functions', value: items.length },
		{
			id: 'ok',
			label: 'Healthy',
			tone: 'success',
			value: items.filter((i) => overallStatus(i) === 'ok').length,
		},
		{
			id: 'error',
			label: 'Error',
			tone: 'danger',
			value: items.filter((i) => overallStatus(i) === 'error').length,
		},
		{
			id: 'proxy_ok',
			label: 'Proxy OK',
			tone: 'success',
			value: items.filter((i) => i.proxyStatus === 'ok').length,
		},
		{
			id: 'direct_ok',
			label: 'Direct OK',
			tone: 'success',
			value: items.filter((i) => i.directStatus === 'ok').length,
		},
	],
	row: (it) => {
		const status = overallStatus(it);
		return (
			<Surface padded={false} style={styles.row}>
				<View
					style={[
						styles.statusDot,
						{ backgroundColor: statusColor(status) },
					]}
				/>
				<Stack gap="xs" style={styles.rowContent}>
					<Stack direction="row" align="center" gap="xs" wrap>
						<Text
							variant="label"
							numberOfLines={1}
							style={styles.name}>
							{it.label}
						</Text>
						<Badge
							label={status.toUpperCase()}
							tone={statusTone(status)}
						/>
					</Stack>
					<Text variant="caption" tone="muted" numberOfLines={1}>
						{it.description}
					</Text>
					{it.proxyLatencyMs !== undefined &&
						it.directLatencyMs !== undefined && (
							<Text variant="caption" tone="faint">
								Proxy: {it.proxyLatencyMs}ms · Direct:{' '}
								{it.directLatencyMs}ms
							</Text>
						)}
				</Stack>
			</Surface>
		);
	},
	card: (it) => {
		const status = overallStatus(it);
		return (
			<Surface style={styles.card}>
				<Stack gap="sm">
					<Stack direction="row" align="center" gap="xs">
						<View
							style={[
								styles.statusDot,
								{ backgroundColor: statusColor(status) },
							]}
						/>
						<Text
							variant="label"
							numberOfLines={1}
							style={styles.name}>
							{it.label}
						</Text>
					</Stack>
					<Text variant="caption" tone="muted">
						{it.description}
					</Text>
					<Stack direction="row" gap="sm" wrap>
						<Badge
							label={`Proxy: ${it.proxyStatus.toUpperCase()}`}
							tone={statusTone(it.proxyStatus)}
						/>
						<Badge
							label={`Direct: ${it.directStatus.toUpperCase()}`}
							tone={statusTone(it.directStatus)}
						/>
					</Stack>
					{it.proxyLatencyMs !== undefined && (
						<Text variant="caption" tone="faint">
							Proxy: {it.proxyLatencyMs}ms
						</Text>
					)}
					{it.directLatencyMs !== undefined && (
						<Text variant="caption" tone="faint">
							Direct: {it.directLatencyMs}ms
						</Text>
					)}
				</Stack>
			</Surface>
		);
	},
	detail: (it) => (
		<Stack gap="xs">
			<Fact label="Name" value={it.name} />
			<Fact label="Label" value={it.label} />
			<Fact label="Description" value={it.description} />
			<Fact
				label="Overall Status"
				value={overallStatus(it).toUpperCase()}
			/>
			<Fact label="Proxy Status" value={it.proxyStatus.toUpperCase()} />
			{it.proxyLatencyMs !== undefined && (
				<Fact label="Proxy Latency" value={`${it.proxyLatencyMs}ms`} />
			)}
			{it.proxyError && (
				<Fact label="Proxy Error" value={it.proxyError} />
			)}
			<Fact label="Direct Status" value={it.directStatus.toUpperCase()} />
			{it.directLatencyMs !== undefined && (
				<Fact
					label="Direct Latency"
					value={`${it.directLatencyMs}ms`}
				/>
			)}
			{it.directError && (
				<Fact label="Direct Error" value={it.directError} />
			)}
			{it.version && <Fact label="Version" value={it.version} />}
			{it.timestamp && (
				<Fact
					label="Last Check"
					value={new Date(it.timestamp).toLocaleString()}
				/>
			)}
		</Stack>
	),
};

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<Stack direction="row" gap="sm" justify="space-between">
			<Text variant="caption" tone="muted">
				{label}
			</Text>
			<Text variant="caption" numberOfLines={1} style={styles.factValue}>
				{value}
			</Text>
		</Stack>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: tokens.space.sm,
		paddingHorizontal: tokens.space.md,
		paddingVertical: tokens.space.sm,
	},
	rowContent: {
		flexShrink: 1,
		flexGrow: 1,
	},
	card: {
		padding: tokens.space.md,
	},
	statusDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		flexShrink: 0,
	},
	name: {
		flexShrink: 1,
	},
	factValue: {
		flexShrink: 1,
		textAlign: 'right',
	},
});
