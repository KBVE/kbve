import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClickHouseStream, clickhouseLens } from '../clickhouse';

describe('ClickHouse Adapter', () => {
	const mockGetToken = vi.fn(async () => 'mock-token');

	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	describe('createClickHouseStream', () => {
		it('creates stream with correct key and config', () => {
			const stream = createClickHouseStream({
				getToken: mockGetToken,
				namespace: 'test-ns',
			});

			expect(stream).toBeDefined();
			expect(stream.key).toBe('clickhouse:logs:test-ns');
		});

		it('fetches logs with correct auth headers', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					rows: [
						{
							timestamp: '2024-01-01 12:00:00',
							level: 'error',
							message: 'test error',
							pod_name: 'test-pod',
							pod_namespace: 'test-ns',
						},
					],
				}),
			});
			global.fetch = mockFetch;

			const stream = createClickHouseStream({
				getToken: mockGetToken,
				namespace: 'test-ns',
			});

			await stream.refresh();

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/dashboard/clickhouse/proxy'),
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({
						Authorization: 'Bearer mock-token',
					}),
				}),
			);
		});

		it('normalizes log rows correctly', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					rows: [
						{
							timestamp: '2024-01-01 12:00:00',
							level: 'error',
							message: 'test error',
							pod_name: 'test-pod',
							pod_namespace: 'test-ns',
							service: 'test-svc',
							container_name: 'test-container',
						},
					],
				}),
			});
			global.fetch = mockFetch;

			const stream = createClickHouseStream({
				getToken: mockGetToken,
			});

			await stream.refresh();
			const items = stream.get().items;

			expect(items).toHaveLength(1);
			expect(items[0]).toMatchObject({
				level: 'error',
				message: 'test error',
				podName: 'test-pod',
				namespace: 'test-ns',
				service: 'test-svc',
				container: 'test-container',
			});
		});

		it('handles 403 errors gracefully', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 403,
			});
			global.fetch = mockFetch;

			const stream = createClickHouseStream({
				getToken: mockGetToken,
			});

			await stream.refresh();

			expect(stream.get().error).toMatch(/access restricted/i);
		});
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
