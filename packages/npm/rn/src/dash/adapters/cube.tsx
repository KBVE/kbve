// Transforms Cube `/v1/load` rows into the dash kit's chart + stat models.
// Row keys are Cube's flattened `cube.member` / `cube.timeDim.granularity`
// identifiers (e.g. `ch_logs.count`, `ch_logs.timestamp.day`).

import { tokens } from '../_ui';
import type { TrendSeries } from '../TrendChart';
import type { StatModel } from '../types';
import type { CubeRow } from '../cube/cubeApi';
import { fmtInt, fmtPct } from '../cube/cubeApi';

export interface RankedRow {
	key: string;
	label: string;
	value: number;
	badge?: string;
}

const num = (v: unknown): number => {
	const n = Number(v ?? 0);
	return Number.isFinite(n) ? n : 0;
};

const ms = (v: unknown): number => {
	const t = new Date(String(v)).getTime();
	return Number.isFinite(t) ? t : 0;
};

const LEVEL_COLOR: Record<string, string> = {
	error: tokens.color.danger,
	warn: tokens.color.warning,
	warning: tokens.color.warning,
	info: tokens.color.primary,
	debug: tokens.color.textMuted,
};

/** `ch_logs.count` by day, one series per `ch_logs.level`. */
export function logsByDayToSeries(rows: CubeRow[]): TrendSeries[] {
	const byLevel = new Map<string, { t: number; v: number }[]>();
	for (const r of rows) {
		const level = String(r['ch_logs.level'] ?? 'other').toLowerCase();
		const t = ms(r['ch_logs.timestamp.day'] ?? r['ch_logs.timestamp']);
		if (!t) continue;
		const arr = byLevel.get(level) ?? [];
		arr.push({ t, v: num(r['ch_logs.count']) });
		byLevel.set(level, arr);
	}
	return [...byLevel.entries()]
		.map(([level, points]) => ({
			label: level,
			color: LEVEL_COLOR[level] ?? tokens.color.textMuted,
			points: points.sort((a, b) => a.t - b.t),
		}))
		.sort((a, b) => a.label.localeCompare(b.label));
}

/** `pg_users.count` by month as a single signups series. */
export function signupsToSeries(rows: CubeRow[]): TrendSeries[] {
	const points = rows
		.map((r) => ({
			t: ms(r['pg_users.created_at.month'] ?? r['pg_users.created_at']),
			v: num(r['pg_users.count']),
		}))
		.filter((p) => p.t)
		.sort((a, b) => a.t - b.t);
	return points.length
		? [{ label: 'signups', color: tokens.color.success, points }]
		: [];
}

function topByDimension(
	rows: CubeRow[],
	dimKey: string,
	measureKey: string,
): RankedRow[] {
	const byDim = new Map<string, number>();
	for (const r of rows) {
		const raw = r[dimKey];
		if (raw == null || raw === '') continue;
		const label = String(raw);
		byDim.set(label, (byDim.get(label) ?? 0) + num(r[measureKey]));
	}
	return [...byDim.entries()]
		.map(([label, value]) => ({ key: label, label, value }))
		.sort((a, b) => b.value - a.value);
}

export function topServicesToRows(rows: CubeRow[]): RankedRow[] {
	return topByDimension(rows, 'ch_logs.service', 'ch_logs.count');
}

export function topNamespacesToRows(rows: CubeRow[]): RankedRow[] {
	return topByDimension(rows, 'ch_logs.pod_namespace', 'ch_logs.count');
}

export function mcPlayersToRows(rows: CubeRow[]): RankedRow[] {
	return topByDimension(
		rows,
		'pg_mc_player.player_name',
		'ch_mc_snapshots.count',
	);
}

/** Flat stat tiles: total logs, error logs, total users. */
export function buildCubeStats(logs: CubeRow[], signups: CubeRow[]): StatModel[] {
	let total = 0;
	let errors = 0;
	for (const r of logs) {
		const c = num(r['ch_logs.count']);
		total += c;
		if (String(r['ch_logs.level'] ?? '').toLowerCase() === 'error') {
			errors += c;
		}
	}
	const users = signups.reduce((a, r) => a + num(r['pg_users.count']), 0);
	const errorRate = total > 0 ? (errors / total) * 100 : 0;

	const signupPoints = signups
		.map((r) => ({
			t: ms(r['pg_users.created_at.month'] ?? r['pg_users.created_at']),
			v: num(r['pg_users.count']),
		}))
		.filter((p) => p.t)
		.sort((a, b) => a.t - b.t);
	const last = signupPoints.at(-1)?.v ?? 0;
	const prev = signupPoints.at(-2)?.v ?? 0;
	const delta = last - prev;
	const deltaTone: StatModel['tone'] =
		delta > 0 ? 'success' : delta < 0 ? 'danger' : 'neutral';

	return [
		{ id: 'logs', label: 'Total logs', value: fmtInt(total), tone: 'primary' },
		{ id: 'errors', label: 'Errors', value: fmtInt(errors), tone: 'danger' },
		{
			id: 'errorRate',
			label: 'Error rate',
			value: fmtPct(errorRate),
			tone: 'danger',
		},
		{ id: 'users', label: 'Users', value: fmtInt(users), tone: 'success' },
		{
			id: 'signupDelta',
			label: 'Signups Δ (mo)',
			value: `${delta >= 0 ? '+' : ''}${fmtInt(delta)}`,
			tone: deltaTone,
		},
	];
}
