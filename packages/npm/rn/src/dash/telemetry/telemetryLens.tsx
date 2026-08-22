import { Badge, Stack, Surface, Text, tokens } from '../_ui';
import { formatAgo } from '../shared';
import type { StreamLens } from '../types';
import { TELEMETRY_CONTROLS } from './telemetryStreams';
import type { TelemetryGroupItem } from './telemetryTypes';

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
