import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clickhouseLens } from '../clickhouse';

describe('ClickHouse Adapter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	describe('clickhouseLens', () => {
		it('provides correct search text', () => {
			const item = {
				id: '1',
				timestamp: '2024-01-01 12:00:00',
				level: 'error',
				message: 'test error',
				podName: 'test-pod',
				namespace: 'test-ns',
				service: 'test-svc',
				container: 'test-container',
				relativeTime: '1m ago',
			};

			const searchText = clickhouseLens.searchText(item);
			expect(searchText).toContain('test-ns');
			expect(searchText).toContain('test-pod');
			expect(searchText).toContain('test-svc');
			expect(searchText).toContain('test error');
		});

		it('groups by namespace', () => {
			const item1 = {
				id: '1',
				namespace: 'ns1',
			} as any;
			const item2 = {
				id: '2',
				namespace: '',
			} as any;

			expect(clickhouseLens.group(item1)).toBe('ns1');
			expect(clickhouseLens.group(item2)).toBe('(cluster)');
		});

		it('filters by log level', () => {
			const errorLog = { level: 'error' } as any;
			const warnLog = { level: 'warn' } as any;
			const infoLog = { level: 'info' } as any;

			const errorFilter = clickhouseLens.filters.find(
				(f) => f.id === 'error',
			)!;
			const warnFilter = clickhouseLens.filters.find(
				(f) => f.id === 'warn',
			)!;

			expect(errorFilter.predicate(errorLog)).toBe(true);
			expect(errorFilter.predicate(warnLog)).toBe(false);
			expect(warnFilter.predicate(warnLog)).toBe(true);
		});

		it('level chips carry server-side level params so the feed requeries', () => {
			const byId = Object.fromEntries(
				clickhouseLens.filters.map((f) => [f.id, f.params]),
			);
			expect(byId['error']).toEqual({ level: 'error' });
			expect(byId['warn']).toEqual({ level: 'warn' });
			expect(byId['info']).toEqual({ level: 'info' });
		});

		it('computes stats correctly', () => {
			const items = [
				{ level: 'error' },
				{ level: 'error' },
				{ level: 'warn' },
				{ level: 'info' },
			] as any[];

			const stats = clickhouseLens.stats(items);
			const totalStat = stats.find((s) => s.id === 'total')!;
			const errorStat = stats.find((s) => s.id === 'errors')!;
			const warnStat = stats.find((s) => s.id === 'warnings')!;

			expect(totalStat.value).toBe(4);
			expect(errorStat.value).toBe(2);
			expect(warnStat.value).toBe(1);
		});

		it('lens stats use meta totals when present', () => {
			const meta = {
				rows: [
					{ level: 'error', cnt: 5 },
					{ level: 'info', cnt: 95 },
				],
			};
			const stats = clickhouseLens.stats!([], meta);
			const total = stats.find((s) => s.id === 'total')!.value;
			const errors = stats.find((s) => s.id === 'errors')!.value;
			expect(total).toBe(100);
			expect(errors).toBe(5);
		});

		it('lens stats fall back to items.length without meta', () => {
			const items = [{ level: 'error' }, { level: 'info' }] as never[];
			const stats = clickhouseLens.stats!(items, undefined);
			expect(stats.find((s) => s.id === 'total')!.value).toBe(2);
		});
	});
});
