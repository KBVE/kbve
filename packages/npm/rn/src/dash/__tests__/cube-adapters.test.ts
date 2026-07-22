import { describe, it, expect } from 'vitest';
import {
	topServicesToRows,
	topNamespacesToRows,
	mcPlayersToRows,
	buildCubeStats,
} from '../adapters/cube';
import {
	fmtPct,
	rangeToDateRange,
	rangeToGranularity,
} from '../cube/cubeApi';
import type { CubeRow } from '../cube/cubeApi';

describe('topServicesToRows', () => {
	it('sums by service, sorts desc, coerces, drops null/empty', () => {
		const rows: CubeRow[] = [
			{ 'ch_logs.service': 'api', 'ch_logs.count': '3' },
			{ 'ch_logs.service': 'api', 'ch_logs.count': 2 },
			{ 'ch_logs.service': 'worker', 'ch_logs.count': 10 },
			{ 'ch_logs.service': null, 'ch_logs.count': 99 },
			{ 'ch_logs.service': '', 'ch_logs.count': 99 },
			{ 'ch_logs.service': 'gw', 'ch_logs.count': 'nan' },
		];
		const out = topServicesToRows(rows);
		expect(out.map((r) => [r.label, r.value])).toEqual([
			['worker', 10],
			['api', 5],
			['gw', 0],
		]);
	});
});

describe('topNamespacesToRows', () => {
	it('groups by pod_namespace', () => {
		const rows: CubeRow[] = [
			{ 'ch_logs.pod_namespace': 'cube', 'ch_logs.count': 4 },
			{ 'ch_logs.pod_namespace': 'kbve', 'ch_logs.count': 7 },
		];
		expect(topNamespacesToRows(rows).map((r) => r.label)).toEqual([
			'kbve',
			'cube',
		]);
	});
});

describe('mcPlayersToRows', () => {
	it('maps federated player_name + snapshot count keys', () => {
		const rows: CubeRow[] = [
			{ 'pg_mc_player.player_name': 'steve', 'ch_mc_snapshots.count': 5 },
			{ 'pg_mc_player.player_name': 'alex', 'ch_mc_snapshots.count': 12 },
		];
		const out = mcPlayersToRows(rows);
		expect(out[0]).toMatchObject({ label: 'alex', value: 12 });
		expect(out[1]).toMatchObject({ label: 'steve', value: 5 });
	});
});

describe('buildCubeStats', () => {
	it('computes error rate and signup month delta', () => {
		const logs: CubeRow[] = [
			{ 'ch_logs.level': 'info', 'ch_logs.count': 75 },
			{ 'ch_logs.level': 'error', 'ch_logs.count': 25 },
		];
		const signups: CubeRow[] = [
			{ 'pg_users.created_at.month': '2026-05-01T00:00:00.000', 'pg_users.count': 10 },
			{ 'pg_users.created_at.month': '2026-06-01T00:00:00.000', 'pg_users.count': 18 },
		];
		const stats = buildCubeStats(logs, signups);
		const by = Object.fromEntries(stats.map((s) => [s.id, s]));
		expect(by.errorRate.value).toBe('25.0%');
		expect(by.signupDelta.value).toBe('+8');
		expect(by.signupDelta.tone).toBe('success');
		expect(by.users.value).toBe('28');
	});

	it('error rate is 0% when no logs (divide by zero)', () => {
		const stats = buildCubeStats([], []);
		const by = Object.fromEntries(stats.map((s) => [s.id, s]));
		expect(by.errorRate.value).toBe('0.0%');
		expect(by.signupDelta.value).toBe('+0');
		expect(by.signupDelta.tone).toBe('neutral');
	});

	it('negative signup delta is danger toned', () => {
		const signups: CubeRow[] = [
			{ 'pg_users.created_at.month': '2026-05-01T00:00:00.000', 'pg_users.count': 20 },
			{ 'pg_users.created_at.month': '2026-06-01T00:00:00.000', 'pg_users.count': 5 },
		];
		const by = Object.fromEntries(
			buildCubeStats([], signups).map((s) => [s.id, s]),
		);
		expect(by.signupDelta.value).toBe('-15');
		expect(by.signupDelta.tone).toBe('danger');
	});
});

describe('range mapping', () => {
	it('rangeToDateRange table', () => {
		expect(rangeToDateRange('24h')).toBe('last 24 hours');
		expect(rangeToDateRange('7d')).toBe('last 7 days');
		expect(rangeToDateRange('30d')).toBe('last 30 days');
		expect(rangeToDateRange('all')).toBeUndefined();
	});

	it('rangeToGranularity uses hour for 24h else base', () => {
		expect(rangeToGranularity('24h', 'day')).toBe('hour');
		expect(rangeToGranularity('7d', 'day')).toBe('day');
		expect(rangeToGranularity('all', 'month')).toBe('month');
	});

	it('fmtPct guards non-finite', () => {
		expect(fmtPct(12.34)).toBe('12.3%');
		expect(fmtPct(Number.NaN)).toBe('0.0%');
	});
});
