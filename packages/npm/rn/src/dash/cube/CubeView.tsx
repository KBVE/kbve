// Cube semantic-layer dashboard: live log-volume + signup trends over the
// Cube REST API, rendered with the shared TrendChart + StatGrid primitives.
// Polls on an interval (default 30s) so the graphs update with live data.

import { useEffect, useMemo, useState } from 'react';
import { Stack, Text } from '../_ui';
import { TrendChart } from '../TrendChart';
import { StatGrid } from '../StatGrid';
import { cubeLoad, fmtInt } from './cubeApi';
import {
	buildCubeStats,
	logsByDayToSeries,
	signupsToSeries,
} from '../adapters/cube';
import type { CubeRow } from './cubeApi';

export interface CubeViewProps {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	/** Poll interval in ms. Defaults to 30s. */
	pollMs?: number;
}

export function CubeView({ getToken, baseUrl = '', pollMs = 30_000 }: CubeViewProps) {
	const [logs, setLogs] = useState<CubeRow[]>([]);
	const [signups, setSignups] = useState<CubeRow[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let active = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const ctrl = new AbortController();

		async function tick() {
			try {
				const token = await getToken();
				const [l, s] = await Promise.all([
					cubeLoad(
						baseUrl,
						token,
						{
							measures: ['ch_logs.count'],
							dimensions: ['ch_logs.level'],
							timeDimensions: [
								{ dimension: 'ch_logs.timestamp', granularity: 'day' },
							],
							order: { 'ch_logs.timestamp': 'asc' },
						},
						ctrl.signal,
					),
					cubeLoad(
						baseUrl,
						token,
						{
							measures: ['pg_users.count'],
							timeDimensions: [
								{ dimension: 'pg_users.created_at', granularity: 'month' },
							],
							order: { 'pg_users.created_at': 'asc' },
						},
						ctrl.signal,
					),
				]);
				if (!active) return;
				setLogs(l);
				setSignups(s);
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
	}, [getToken, baseUrl, pollMs]);

	const logSeries = useMemo(() => logsByDayToSeries(logs), [logs]);
	const signupSeries = useMemo(() => signupsToSeries(signups), [signups]);
	const stats = useMemo(() => buildCubeStats(logs, signups), [logs, signups]);

	return (
		<Stack gap="md">
			{error ? (
				<Text tone="muted">Cube error: {error}</Text>
			) : loading ? (
				<Text tone="muted">Loading Cube metrics…</Text>
			) : null}
			<StatGrid stats={stats} />
			<TrendChart
				title="Log volume by level · per day"
				series={logSeries}
				format={fmtInt}
				zeroFloor
				height={200}
			/>
			<TrendChart
				title="User signups · per month"
				series={signupSeries}
				format={fmtInt}
				zeroFloor
				height={180}
			/>
		</Stack>
	);
}
