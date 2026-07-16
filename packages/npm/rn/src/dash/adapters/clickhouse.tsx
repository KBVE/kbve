import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import type { BadgeTone } from '../_ui';
import type { StreamLens } from '../types';
import { buildStatsTotals, CH_CONTROLS } from '../clickhouse/clickhouseStream';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawLogRow {
	timestamp: string;
	level?: string;
	message?: string;
	pod_name?: string;
	pod_namespace?: string;
	service?: string;
	container_name?: string;
}

export interface LogItem {
	id: string;
	timestamp: string;
	level: string;
	message: string;
	podName: string;
	namespace: string;
	service: string;
	container: string;
	relativeTime: string;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalize(raw: RawLogRow): LogItem {
	const level = (raw.level ?? 'info').toLowerCase();
	const namespace = raw.pod_namespace ?? '';
	const podName = raw.pod_name ?? '';
	const service = raw.service ?? '';
	const container = raw.container_name ?? '';
	const message = raw.message ?? '';

	// Create unique ID from timestamp + namespace + podName
	const id = `${raw.timestamp}:${namespace}:${podName}`;

	// Calculate relative time
	const relativeTime = formatRelativeTime(raw.timestamp);

	return {
		id,
		timestamp: raw.timestamp,
		level,
		message,
		podName,
		namespace,
		service,
		container,
		relativeTime,
	};
}

function formatRelativeTime(ts: string): string {
	try {
		const then = new Date(ts.replace(' ', 'T') + 'Z').getTime();
		const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
		if (diffSec < 60) return `${diffSec}s ago`;
		const diffMin = Math.round(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.round(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		return `${Math.round(diffHr / 24)}d ago`;
	} catch {
		return ts;
	}
}

// ---------------------------------------------------------------------------
// Lens
// ---------------------------------------------------------------------------

function levelTone(level: string): BadgeTone {
	const l = level.toLowerCase();
	if (l === 'error') return 'danger';
	if (l === 'warn' || l === 'warning') return 'warning';
	if (l === 'info') return 'neutral';
	return 'neutral';
}

function levelColor(level: string): string {
	const l = level.toLowerCase();
	if (l === 'error') return tokens.color.danger;
	if (l === 'warn' || l === 'warning') return tokens.color.warning;
	if (l === 'info') return tokens.color.textMuted;
	return tokens.color.textFaint;
}

export const clickhouseLens: StreamLens<LogItem> = {
	searchText: (it) =>
		`${it.namespace} ${it.podName} ${it.service} ${it.message}`,
	group: (it) => it.namespace || '(cluster)',
	filters: [
		{
			id: 'error',
			label: 'Errors',
			tone: 'danger',
			predicate: (it) => it.level === 'error',
			params: { level: 'error' },
		},
		{
			id: 'warn',
			label: 'Warnings',
			tone: 'warning',
			predicate: (it) => it.level === 'warn' || it.level === 'warning',
			params: { level: 'warn' },
		},
		{
			id: 'info',
			label: 'Info',
			tone: 'neutral',
			predicate: (it) => it.level === 'info',
			params: { level: 'info' },
		},
	],
	stats: (items, meta) => {
		const t = meta
			? buildStatsTotals(meta)
			: {
					total: items.length,
					errors: items.filter((i) => i.level === 'error').length,
					warnings: items.filter(
						(i) => i.level === 'warn' || i.level === 'warning',
					).length,
				};
		return [
			{ id: 'total', label: 'Total Logs', value: t.total },
			{ id: 'errors', label: 'Errors', tone: 'danger', value: t.errors },
			{
				id: 'warnings',
				label: 'Warnings',
				tone: 'warning',
				value: t.warnings,
			},
		];
	},
	controls: CH_CONTROLS,
	row: (it) => (
		<Surface padded={false} style={styles.row}>
			<View
				style={[
					styles.levelDot,
					{ backgroundColor: levelColor(it.level) },
				]}
			/>
			<Stack gap="xs" style={styles.rowContent}>
				<Stack direction="row" align="center" gap="xs" wrap>
					<Badge
						label={it.level.toUpperCase()}
						tone={levelTone(it.level)}
					/>
					<Text variant="caption" tone="faint">
						{it.relativeTime}
					</Text>
				</Stack>
				<Text variant="caption" numberOfLines={2}>
					{it.message}
				</Text>
				<Text variant="caption" tone="faint">
					{it.namespace}
					{it.podName ? ` / ${it.podName}` : ''}
					{it.container ? ` / ${it.container}` : ''}
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
							styles.levelDot,
							{ backgroundColor: levelColor(it.level) },
						]}
					/>
					<Badge
						label={it.level.toUpperCase()}
						tone={levelTone(it.level)}
					/>
					<Text variant="caption" tone="faint">
						{it.relativeTime}
					</Text>
				</Stack>
				<Text variant="caption">{it.message}</Text>
				<Text variant="caption" tone="muted">
					{it.namespace}
					{it.podName ? ` / ${it.podName}` : ''}
				</Text>
				{it.service && (
					<Text variant="caption" tone="faint">
						Service: {it.service}
					</Text>
				)}
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Fact label="Level" value={it.level.toUpperCase()} />
			<Fact
				label="Timestamp"
				value={new Date(it.timestamp).toLocaleString()}
			/>
			<Fact label="Relative" value={it.relativeTime} />
			{it.namespace && <Fact label="Namespace" value={it.namespace} />}
			{it.podName && <Fact label="Pod" value={it.podName} />}
			{it.service && <Fact label="Service" value={it.service} />}
			{it.container && <Fact label="Container" value={it.container} />}
			{it.message && (
				<Stack gap="xs">
					<Text variant="caption" weight="medium" tone="muted">
						Message:
					</Text>
					<Text variant="caption" tone="faint">
						{it.message}
					</Text>
				</Stack>
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
	levelDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		flexShrink: 0,
	},
	factValue: {
		flexShrink: 1,
		textAlign: 'right',
	},
});
