import { describe, expect, it } from 'vitest';
import {
	describeLedgerRow,
	formatDelta,
	ledgerToHistory,
	type LedgerRow,
} from '../walletMath';

function row(overrides: Partial<LedgerRow>): LedgerRow {
	return {
		ledger_id: 1,
		currency: 'credits',
		delta: 10,
		balance_after: 10,
		source_kind: 'coupon_grant',
		created_at: '2026-07-01T00:00:00Z',
		...overrides,
	};
}

describe('ledgerToHistory', () => {
	it('splits rows by currency in ascending time order', () => {
		const history = ledgerToHistory([
			row({
				ledger_id: 3,
				balance_after: 30,
				created_at: '2026-07-03T00:00:00Z',
			}),
			row({
				ledger_id: 1,
				balance_after: 10,
				created_at: '2026-07-01T00:00:00Z',
			}),
			row({
				ledger_id: 2,
				currency: 'khash',
				balance_after: 5,
				created_at: '2026-07-02T00:00:00Z',
			}),
		]);
		expect(history.credits.map((p) => p.v)).toEqual([10, 30]);
		expect(history.khash.map((p) => p.v)).toEqual([5]);
		expect(history.credits[0].t).toBeLessThan(history.credits[1].t);
	});

	it('drops rows with unparseable timestamps', () => {
		const history = ledgerToHistory([row({ created_at: 'garbage' })]);
		expect(history.credits).toEqual([]);
	});
});

describe('formatDelta', () => {
	it('signs positive deltas', () => {
		expect(formatDelta(1500)).toBe('+1,500');
	});

	it('keeps negative sign', () => {
		expect(formatDelta(-42)).toBe('-42');
	});
});

describe('describeLedgerRow', () => {
	it('prefers the reason', () => {
		expect(describeLedgerRow(row({ reason: 'Daily bonus' }))).toBe(
			'Daily bonus',
		);
	});

	it('falls back to humanized source kind', () => {
		expect(describeLedgerRow(row({ source_kind: 'market_buy' }))).toBe(
			'market buy',
		);
	});
});
