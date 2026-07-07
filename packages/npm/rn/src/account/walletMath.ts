import type { Schemas } from '@kbve/core';
import type { SeriesPoint } from '../dash/clusterHealth';

export type LedgerRow = Schemas['LedgerRowDto'];

export interface WalletHistory {
	credits: SeriesPoint[];
	khash: SeriesPoint[];
}

export function ledgerToHistory(rows: LedgerRow[]): WalletHistory {
	const history: WalletHistory = { credits: [], khash: [] };
	const ascending = [...rows].sort(
		(a, b) =>
			Date.parse(a.created_at) - Date.parse(b.created_at) ||
			a.ledger_id - b.ledger_id,
	);
	for (const row of ascending) {
		const t = Date.parse(row.created_at);
		if (!Number.isFinite(t)) continue;
		const point = { t, v: row.balance_after };
		if (row.currency === 'credits') history.credits.push(point);
		else if (row.currency === 'khash') history.khash.push(point);
	}
	return history;
}

export function formatDelta(delta: number): string {
	const sign = delta > 0 ? '+' : '';
	return `${sign}${delta.toLocaleString()}`;
}

export function describeLedgerRow(row: LedgerRow): string {
	if (row.reason) return row.reason;
	return row.source_kind.replace(/_/g, ' ');
}
