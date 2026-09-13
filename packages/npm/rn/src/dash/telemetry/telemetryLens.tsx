import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import { formatAgo } from '../shared';
import type { StreamLens } from '../types';
import { TELEMETRY_CONTROLS } from './telemetryStreams';
import type {
	PerfSummaryItem,
	ProductEventItem,
	TelemetryGroupItem,
} from './telemetryTypes';

/** ClickHouse renders DateTime as `YYYY-MM-DD HH:MM:SS[.mmm]`, which Safari
 *  refuses to parse — it wants the `T`. Returning null rather than an Invalid
 *  Date keeps `formatAgo` from printing "NaN years ago". */
function parseChDate(raw: string): Date | null {
	if (!raw) return null;
	const d = new Date(raw.replace(' ', 'T'));
	return Number.isNaN(d.getTime()) ? null : d;
}

function seen(raw: string): string {
	const d = parseChDate(raw);
	return d ? formatAgo(d) : '—';
}

export const telemetryGroupsLens: StreamLens<TelemetryGroupItem> = {
	searchText: (it) =>
		`${it.project} ${it.errorType} ${it.sampleMessage} ${it.fingerprint}`,
	group: (it) => it.project || 'unknown',
	controls: TELEMETRY_CONTROLS,
	stats: (items) => [
		{ id: 'groups', label: 'Groups', value: items.length },
		{
			id: 'events',
			label: 'Events',
			tone: 'danger' as const,
			value: items.reduce((sum, it) => sum + it.events, 0),
		},
		{
			id: 'sessions',
			label: 'Sessions',
			value: items.reduce((sum, it) => sum + it.sessions, 0),
		},
		{
			id: 'projects',
			label: 'Projects',
			value: new Set(items.map((it) => it.project)).size,
		},
	],
	row: (it) => (
		<Surface style={{ padding: tokens.space.md }}>
			<Stack gap="xs">
				<Stack direction="row" gap="xs" align="center">
					<Badge label={`×${it.events}`} tone="danger" />
					<Text variant="caption" tone="faint">
						{it.project}
						{it.errorType ? ` / ${it.errorType}` : ''}
					</Text>
				</Stack>
				<Text variant="body" numberOfLines={2}>
					{it.sampleMessage || '(no message)'}
				</Text>
				<Text variant="caption" tone="muted">
					{it.sessions} session{it.sessions === 1 ? '' : 's'} · last seen{' '}
					{seen(it.lastSeen)}
				</Text>
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Text variant="caption" tone="muted">
				first seen {seen(it.firstSeen)} · last seen {seen(it.lastSeen)}
			</Text>
			<Text variant="caption" tone="faint">
				{it.fingerprint}
			</Text>
		</Stack>
	),
};

/** Vitals are milliseconds except CLS, which is a unitless ratio in the
 *  hundredths. Rendering 0.08 as "0ms" is the whole reason this is not a plain
 *  `Math.round`. */
function formatVital(metric: string, value: number): string {
	if (metric === 'cls') return value.toFixed(3);
	if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
	return `${Math.round(value)}ms`;
}

/** The Web Vitals good/poor boundaries, duplicated from the SDK on purpose: the
 *  dashboard renders whatever the service stored, including rows written by a
 *  client that predates a threshold change, so it rates what it is showing
 *  rather than trusting a rating column it did not compute. */
const VITAL_BOUNDS: Record<string, [number, number]> = {
	lcp: [2500, 4000],
	inp: [200, 500],
	cls: [0.1, 0.25],
	fcp: [1800, 3000],
	ttfb: [800, 1800],
};

function vitalTone(metric: string, p75: number): 'success' | 'warning' | 'danger' {
	const bounds = VITAL_BOUNDS[metric];
	// An unknown metric cannot be rated, and colouring it green would assert a
	// pass the dashboard has no basis for.
	if (!bounds) return 'warning';
	if (p75 <= bounds[0]) return 'success';
	if (p75 <= bounds[1]) return 'warning';
	return 'danger';
}

export const telemetryPerfLens: StreamLens<PerfSummaryItem> = {
	searchText: (it) => `${it.project} ${it.metric}`,
	group: (it) => it.project || 'unknown',
	controls: TELEMETRY_CONTROLS,
	stats: (items) => [
		{ id: 'metrics', label: 'Metrics', value: items.length },
		{
			id: 'samples',
			label: 'Samples',
			value: items.reduce((sum, it) => sum + it.samples, 0),
		},
		{
			id: 'poor',
			label: 'Poor',
			tone: 'danger' as const,
			value: items.filter((it) => vitalTone(it.metric, it.p75) === 'danger')
				.length,
		},
		{
			id: 'projects',
			label: 'Projects',
			value: new Set(items.map((it) => it.project)).size,
		},
	],
	row: (it) => (
		<Surface style={{ padding: tokens.space.md }}>
			<Stack gap="xs">
				<Stack direction="row" gap="xs" align="center">
					<Badge
						label={formatVital(it.metric, it.p75)}
						tone={vitalTone(it.metric, it.p75)}
					/>
					<Text variant="caption" tone="faint">
						{it.project} / {it.metric.toUpperCase()}
					</Text>
				</Stack>
				<Text variant="caption" tone="muted">
					p50 {formatVital(it.metric, it.p50)} · p95{' '}
					{formatVital(it.metric, it.p95)} · {it.samples} sample
					{it.samples === 1 ? '' : 's'}
				</Text>
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Text variant="caption" tone="muted">
				{it.sessions} session{it.sessions === 1 ? '' : 's'} · first seen{' '}
				{seen(it.firstSeen)} · last seen {seen(it.lastSeen)}
			</Text>
		</Stack>
	),
};

export const telemetryProductLens: StreamLens<ProductEventItem> = {
	searchText: (it) => `${it.project} ${it.name}`,
	group: (it) => it.project || 'unknown',
	controls: TELEMETRY_CONTROLS,
	stats: (items) => [
		{ id: 'names', label: 'Events', value: items.length },
		{
			id: 'total',
			label: 'Fired',
			value: items.reduce((sum, it) => sum + it.events, 0),
		},
		{
			id: 'users',
			label: 'Users',
			value: items.reduce((sum, it) => sum + it.users, 0),
		},
		{
			id: 'projects',
			label: 'Projects',
			value: new Set(items.map((it) => it.project)).size,
		},
	],
	row: (it) => (
		<Surface style={{ padding: tokens.space.md }}>
			<Stack gap="xs">
				<Stack direction="row" gap="xs" align="center">
					<Badge label={`×${it.events}`} tone="primary" />
					<Text variant="caption" tone="faint">
						{it.project}
					</Text>
				</Stack>
				<Text variant="body" numberOfLines={1}>
					{it.name}
				</Text>
				<Text variant="caption" tone="muted">
					{it.sessions} session{it.sessions === 1 ? '' : 's'} · {it.users} user
					{it.users === 1 ? '' : 's'} · last seen {seen(it.lastSeen)}
				</Text>
			</Stack>
		</Surface>
	),
	detail: (it) => (
		<Stack gap="xs">
			<Text variant="caption" tone="muted">
				first seen {seen(it.firstSeen)} · last seen {seen(it.lastSeen)}
			</Text>
		</Stack>
	),
};
