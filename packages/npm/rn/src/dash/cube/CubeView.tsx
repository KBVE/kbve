// Cube semantic-layer dashboard: live log-volume + signup trends, top services /
// namespaces, and federated Minecraft player activity over the Cube REST API.
// Polls on an interval (default 30s) so the graphs update with live data. A local
// range control drives the time window on every time-scoped query.

import { useEffect, useMemo, useState } from 'react';
import { Stack, Text } from '../_ui';
import { TrendChart } from '../TrendChart';
import { StatGrid } from '../StatGrid';
import { RangeControl } from './RangeControl';
import { RankedRows } from './RankedRows';
import {
	cubeLoad,
	fmtInt,
	rangeToDateRange,
	rangeToGranularity,
} from './cubeApi';
import type {
	CubeRow,
	CubeQuery,
	CubeTimeDimension,
	RangeKey,
} from './cubeApi';
import {
	buildCubeStats,
	logsByDayToSeries,
	signupsToSeries,
	topServicesToRows,
	topNamespacesToRows,
	mcPlayersToRows,
} from '../adapters/cube';

export interface CubeViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	/** Poll interval in ms. Defaults to 30s. */
	pollMs?: number;
	/** Initial time window. Defaults to 7d. */
	initialRange?: RangeKey;
}

interface Snapshot {
	logs: CubeRow[];
	signups: CubeRow[];
	services: CubeRow[];
	namespaces: CubeRow[];
	players: CubeRow[];
}

const EMPTY: Snapshot = {
	logs: [],
	signups: [],
	services: [],
	namespaces: [],
	players: [],
};

export function CubeView({
	getToken,
	baseUrl = '',
	pollMs = 30_000,
	initialRange = '7d',
}: CubeViewProps) {
	const [range, setRange] = useState<RangeKey>(initialRange);
	const [data, setData] = useState<Snapshot>(EMPTY);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let active = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const ctrl = new AbortController();

		const dateRange = rangeToDateRange(range);
		const logTime: CubeTimeDimension = {
			dimension: 'ch_logs.timestamp',
			...(dateRange ? { dateRange } : {}),
		};

		async function tick() {
			try {
				const token = await getToken();
				const load = (query: CubeQuery) =>
					cubeLoad(baseUrl, token, query, ctrl.signal);
				const [logs, signups, services, namespaces, players] =
					await Promise.all([
						load({
							measures: ['ch_logs.count'],
							dimensions: ['ch_logs.level'],
							timeDimensions: [
								{
									...logTime,
									granularity: rangeToGranularity(range, 'day'),
								},
							],
							order: { 'ch_logs.timestamp': 'asc' },
						}),
						load({
							measures: ['pg_users.count'],
							timeDimensions: [
								{
									dimension: 'pg_users.created_at',
									granularity: rangeToGranularity(range, 'month'),
									...(dateRange ? { dateRange } : {}),
								},
							],
							order: { 'pg_users.created_at': 'asc' },
						}),
						load({
							measures: ['ch_logs.count'],
							dimensions: ['ch_logs.service'],
							timeDimensions: [logTime],
							order: { 'ch_logs.count': 'desc' },
							limit: 8,
						}),
						load({
							measures: ['ch_logs.count'],
							dimensions: ['ch_logs.pod_namespace'],
							timeDimensions: [logTime],
							order: { 'ch_logs.count': 'desc' },
							limit: 8,
						}),
						load({
							measures: ['ch_mc_snapshots.count'],
							dimensions: ['pg_mc_player.player_name'],
							order: { 'ch_mc_snapshots.count': 'desc' },
							limit: 8,
						}),
					]);
				if (!active) return;
				setData({ logs, signups, services, namespaces, players });
				setError(null);
				setLoading(false);
			} catch (e) {
				if (!active || (e as Error).name === 'AbortError') return;
				setError((e as Error).message);
				setLoading(false);
			} finally {
				if (active) timer = setTimeout(tick, pollMs);
			}
		}

		tick();
		return () => {
			active = false;
			ctrl.abort();
			if (timer) clearTimeout(timer);
		};
	}, [getToken, baseUrl, pollMs, range]);

	const logSeries = useMemo(() => logsByDayToSeries(data.logs), [data.logs]);
	const signupSeries = useMemo(
		() => signupsToSeries(data.signups),
		[data.signups],
	);
	const stats = useMemo(
		() => buildCubeStats(data.logs, data.signups),
		[data.logs, data.signups],
	);
	const serviceRows = useMemo(
		() => topServicesToRows(data.services),
		[data.services],
	);
	const namespaceRows = useMemo(
		() => topNamespacesToRows(data.namespaces),
		[data.namespaces],
	);
	const playerRows = useMemo(
		() => mcPlayersToRows(data.players),
		[data.players],
	);

	return (
		<Stack gap="md">
			<RangeControl value={range} onChange={setRange} />
			{error ? (
				<Text tone="muted">Cube error: {error}</Text>
			) : loading ? (
				<Text tone="muted">Loading Cube metrics…</Text>
			) : null}
			<StatGrid stats={stats} />
			<TrendChart
				title="Log volume by level"
				series={logSeries}
				format={fmtInt}
				zeroFloor
				height={200}
			/>
			<TrendChart
				title="User signups"
				series={signupSeries}
				format={fmtInt}
				zeroFloor
				height={180}
			/>
			<RankedRows
				title="Top services · by log volume"
				rows={serviceRows}
				format={fmtInt}
			/>
			<RankedRows
				title="Top namespaces · by log volume"
				rows={namespaceRows}
				format={fmtInt}
			/>
			<RankedRows
				title="Minecraft players · by snapshots"
				rows={playerRows}
				format={fmtInt}
			/>
		</Stack>
	);
}
