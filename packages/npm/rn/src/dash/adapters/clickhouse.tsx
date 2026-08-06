import { StyleSheet, View } from 'react-native';
import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import type { BadgeTone } from '../_ui';
import type { StreamLens } from '../types';
import type { LogItem } from '../clickhouse/logItem';
import { parseMetadataFacts } from '../clickhouse/logItem';
import { buildStatsTotals, CH_CONTROLS } from '../clickhouse/clickhouseStream';

export type { RawLogRow, LogItem, MetaFact } from '../clickhouse/logItem';
export { normalize, parseMetadataFacts } from '../clickhouse/logItem';

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
					<Text variant="caption" tone="faint" selectable>
						{it.message}
					</Text>
				</Stack>
			)}
			<MetadataFacts rawMeta={it.metadataRaw} />
		</Stack>
	),
};

function MetadataFacts({ rawMeta }: { rawMeta: string }) {
	const facts = parseMetadataFacts(rawMeta);
	if (!facts.length) return null;
	return (
		<Stack gap="xs">
			<Text variant="caption" weight="medium" tone="muted">
				Metadata:
			</Text>
			{facts.map((f) => (
				<Stack
					key={f.key}
					direction="row"
					gap="sm"
					justify="space-between">
					<Text variant="caption" tone="muted">
						{f.key}
					</Text>
					<Text
						variant="caption"
						tone="faint"
						selectable
						style={styles.metaValue}>
						{f.value}
					</Text>
				</Stack>
			))}
		</Stack>
	);
}

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
	metaValue: {
		flexShrink: 1,
		textAlign: 'right',
	},
});
