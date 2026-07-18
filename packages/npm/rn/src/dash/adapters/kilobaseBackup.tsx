import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import type { BadgeTone } from '../_ui';
import { createStreamSource } from '../createStreamSource';
import type { StatModel, StreamLens, StreamStore } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawS3Object {
	key: string;
	size: number;
	last_modified: string;
}

export interface RawObjectsResponse {
	objects: RawS3Object[];
	next_token: string | null;
}

export interface S3ObjectItem {
	id: string;
	key: string;
	size: number;
	lastModified: string;
	age: string;
}

export interface LatestBaseBackup {
	id: string;
	time: string;
	size_bytes: number;
	age_seconds: number;
}

export interface BackupSummary {
	latest_base_backup: LatestBaseBackup | null;
	base_backup_count: number;
	wal_count: number;
	total_size_bytes: number;
	oldest_object_age_seconds: number;
	retention_days: number;
	retention_ok: boolean;
	generated_at: string;
}

export interface KilobaseBackupStreamOptions {
	/** Returns a fresh bearer token (Supabase access token). */
	getToken: () => Promise<string | null>;
	/** Origin for the proxy. '' (relative) on web, absolute URL on mobile. */
	baseUrl?: string;
	pollMs?: number;
	limit?: number;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function formatAge(timestamp: string): string {
	try {
		const then = new Date(timestamp).getTime();
		const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
		if (diffSec < 60) return `${diffSec}s ago`;
		const diffMin = Math.round(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.round(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		return `${Math.round(diffHr / 24)}d ago`;
	} catch {
		return '—';
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	const mb = kb / 1024;
	if (mb < 1024) return `${mb.toFixed(1)} MB`;
	return `${(mb / 1024).toFixed(2)} GB`;
}

function normalizeObject(raw: RawS3Object): S3ObjectItem {
	return {
		id: raw.key,
		key: raw.key,
		size: raw.size,
		lastModified: raw.last_modified,
		age: formatAge(raw.last_modified),
	};
}

export function mapObjectsResponse(json: RawObjectsResponse): {
	objects: S3ObjectItem[];
	nextToken: string | null;
} {
	const objects = (json?.objects ?? []).map(normalizeObject);
	const nextToken = json?.next_token ?? null;
	return { objects, nextToken };
}

export function retentionBadge(summary: BackupSummary): 'ok' | 'warn' {
	if (!summary.retention_ok || summary.latest_base_backup === null)
		return 'warn';
	return 'ok';
}

// ---------------------------------------------------------------------------
// Stream Source
// ---------------------------------------------------------------------------

export function createKilobaseBackupStream(
	opts: KilobaseBackupStreamOptions,
): StreamStore<S3ObjectItem> {
	const { getToken, baseUrl = '', pollMs = 30_000, limit = 100 } = opts;

	return createStreamSource<S3ObjectItem, S3ObjectItem>({
		key: 'kilobase:s3objects',
		pollMs,
		cacheTtlMs: 60_000,
		initialParams: { limit },
		id: (it) => it.id,
		signature: (it) => `${it.key}|${it.size}|${it.lastModified}`,
		normalize: (it) => it,
		fetch: async ({ signal }, params) => {
			const token = await getToken();
			const qs = new URLSearchParams();
			if (params['prefix']) qs.set('prefix', String(params['prefix']));
			if (params['token']) qs.set('token', String(params['token']));
			qs.set('limit', String(params['limit'] ?? limit));

			const res = await fetch(
				`${baseUrl}/dashboard/kilobase/s3/objects?${qs.toString()}`,
				{
					headers: token
						? { Authorization: `Bearer ${token}` }
						: undefined,
					signal,
				},
			);

			if (res.status === 403) throw new Error('Access restricted');
			if (res.status === 502)
				throw new Error('Kilobase S3 upstream unreachable');
			if (!res.ok)
				throw new Error(`Kilobase S3 objects error: ${res.status}`);

			const json = (await res.json()) as RawObjectsResponse;
			return mapObjectsResponse(json).objects;
		},
		fetchMeta: async ({ signal }) => {
			const token = await getToken();
			const res = await fetch(`${baseUrl}/dashboard/kilobase/s3/summary`, {
				headers: token ? { Authorization: `Bearer ${token}` } : undefined,
				signal,
			});

			if (!res.ok)
				throw new Error(`Kilobase S3 summary error: ${res.status}`);

			return (await res.json()) as BackupSummary;
		},
	});
}

// ---------------------------------------------------------------------------
// Lens
// ---------------------------------------------------------------------------

function isBaseBackup(key: string): boolean {
	return key.includes('/base/') || key.startsWith('base/');
}

function kindTone(key: string): BadgeTone {
	return isBaseBackup(key) ? 'primary' : 'neutral';
}

function kindColor(key: string): string {
	return isBaseBackup(key) ? tokens.color.primary : tokens.color.textFaint;
}

function retentionTone(badge: 'ok' | 'warn'): BadgeTone {
	return badge === 'ok' ? 'success' : 'warning';
}

export const kilobaseBackupLens: StreamLens<S3ObjectItem> = {
	searchText: (it) => it.key,
	group: (it) => (isBaseBackup(it.key) ? 'Base Backups' : 'WAL Segments'),
	filters: [
		{
			id: 'base',
			label: 'Base Backups',
			tone: 'primary',
			predicate: (it) => isBaseBackup(it.key),
		},
		{
			id: 'wal',
			label: 'WAL Segments',
			tone: 'neutral',
			predicate: (it) => !isBaseBackup(it.key),
		},
	],
	stats: (items, meta) => {
		const summary = meta as BackupSummary | undefined;
		const stats: StatModel[] = [
			{ id: 'total', label: 'Objects', value: items.length },
			{
				id: 'size',
				label: 'Total Size',
				value: formatBytes(
					items.reduce((sum, i) => sum + i.size, 0),
				),
			},
		];
		if (summary) {
			const badge = retentionBadge(summary);
			stats.push(
				{
					id: 'base_backups',
					label: 'Base Backups',
					value: summary.base_backup_count,
				},
				{
					id: 'wal_count',
					label: 'WAL Count',
					value: summary.wal_count,
				},
				{
					id: 'retention',
					label: 'Retention',
					tone: retentionTone(badge),
					value: badge.toUpperCase(),
				},
			);
		}
		return stats;
	},
	row: (it) => (
		<Surface padded={false} style={styles.row}>
			<View
				style={[
					styles.kindDot,
					{ backgroundColor: kindColor(it.key) },
				]}
			/>
			<Stack gap="xs" style={styles.rowContent}>
				<Stack direction="row" align="center" gap="xs" wrap>
					<Text variant="label" numberOfLines={1} style={styles.key}>
						{it.key}
					</Text>
					<Badge
						label={isBaseBackup(it.key) ? 'BASE' : 'WAL'}
						tone={kindTone(it.key)}
					/>
				</Stack>
				<Text variant="caption" tone="faint">
					{formatBytes(it.size)} · {it.age}
				</Text>
			</Stack>
		</Surface>
	),
	card: (it) => (
		<Surface style={styles.card}>
			<Stack gap="sm">
				<Stack direction="row" align="center" gap="xs">
					<View
						style={[
							styles.kindDot,
							{ backgroundColor: kindColor(it.key) },
						]}
					/>
					<Text variant="label" numberOfLines={1} style={styles.key}>
						{it.key}
					</Text>
				</Stack>
				<Badge
					label={isBaseBackup(it.key) ? 'BASE' : 'WAL'}
					tone={kindTone(it.key)}
				/>
				<Text variant="caption" tone="faint">
					{formatBytes(it.size)} · Updated {it.age}
				</Text>
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Fact label="Key" value={it.key} />
			<Fact label="Kind" value={isBaseBackup(it.key) ? 'BASE' : 'WAL'} />
			<Fact label="Size" value={formatBytes(it.size)} />
			<Fact label="Last Modified" value={it.age} />
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
	kindDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		flexShrink: 0,
	},
	key: {
		flexShrink: 1,
	},
	factValue: {
		flexShrink: 1,
		textAlign: 'right',
	},
});
