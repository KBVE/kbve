import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	retentionBadge,
	mapObjectsResponse,
	kilobaseBackupLens,
	formatDuration,
} from '../kilobaseBackup';
import type { BackupSummary, RawObjectsResponse } from '../kilobaseBackup';

describe('kilobaseBackup adapter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	describe('retentionBadge', () => {
		const healthy: BackupSummary = {
			latest_base_backup: {
				id: 'base-1',
				time: 1_784_246_400,
				size_bytes: 1024,
				age_seconds: 3600,
			},
			base_backup_count: 3,
			wal_count: 42,
			total_size_bytes: 1_000_000,
			oldest_object_age_seconds: 604_800,
			retention_days: 7,
			retention_ok: true,
			generated_at: 1_784_250_000,
		};

		it('returns warn when retention_ok is false', () => {
			const summary: BackupSummary = { ...healthy, retention_ok: false };
			expect(retentionBadge(summary)).toBe('warn');
		});

		it('returns warn when latest_base_backup is null', () => {
			const summary: BackupSummary = {
				...healthy,
				latest_base_backup: null,
			};
			expect(retentionBadge(summary)).toBe('warn');
		});

		it('returns warn when both retention_ok is false and latest_base_backup is null', () => {
			const summary: BackupSummary = {
				...healthy,
				retention_ok: false,
				latest_base_backup: null,
			};
			expect(retentionBadge(summary)).toBe('warn');
		});

		it('returns ok for a healthy summary', () => {
			expect(retentionBadge(healthy)).toBe('ok');
		});
	});

	describe('mapObjectsResponse', () => {
		it('maps next_token to nextToken', () => {
			const json: RawObjectsResponse = {
				objects: [],
				next_token: 'abc123',
			};
			const { nextToken } = mapObjectsResponse(json);
			expect(nextToken).toBe('abc123');
		});

		it('maps null next_token to null nextToken', () => {
			const json: RawObjectsResponse = {
				objects: [],
				next_token: null,
			};
			const { nextToken } = mapObjectsResponse(json);
			expect(nextToken).toBeNull();
		});

		it('normalizes raw objects into S3ObjectItem shape', () => {
			const json: RawObjectsResponse = {
				objects: [
					{
						key: 'barman/backup/base/20260717T000000/data.tar',
						size: 2048,
						last_modified: 1_784_246_400,
					},
				],
				next_token: null,
			};
			const { objects } = mapObjectsResponse(json);
			expect(objects).toHaveLength(1);
			expect(objects[0]).toMatchObject({
				id: 'barman/backup/base/20260717T000000/data.tar',
				key: 'barman/backup/base/20260717T000000/data.tar',
				size: 2048,
				lastModified: 1_784_246_400,
			});
		});

		it('formats the age of a raw object from a unix-seconds last_modified', () => {
			const nowSec = Math.floor(Date.now() / 1000);
			const json: RawObjectsResponse = {
				objects: [
					{
						key: 'barman/backup/wals/000000010000000000000001',
						size: 512,
						last_modified: nowSec - 3600,
					},
				],
				next_token: null,
			};
			const { objects } = mapObjectsResponse(json);
			expect(objects[0]?.age).toBe('1h ago');
		});

		it('defaults to empty objects when the response omits the field', () => {
			const { objects, nextToken } = mapObjectsResponse(
				{} as RawObjectsResponse,
			);
			expect(objects).toEqual([]);
			expect(nextToken).toBeNull();
		});
	});

	describe('kilobaseBackupLens', () => {
		it('groups base backups and WAL segments separately', () => {
			const base = { key: 'barman/backup/base/20260717T000000/data.tar' } as any;
			const wal = { key: 'barman/backup/wals/000000010000000000000001' } as any;
			expect(kilobaseBackupLens.group!(base)).toBe('Base Backups');
			expect(kilobaseBackupLens.group!(wal)).toBe('WAL Segments');
		});

		it('provides search text from the object key', () => {
			const item = {
				key: 'barman/backup/base/20260717T000000/data.tar',
			} as any;
			expect(kilobaseBackupLens.searchText!(item)).toContain(
				'barman/backup/base/20260717T000000/data.tar',
			);
		});

		const summary: BackupSummary = {
			latest_base_backup: {
				id: 'base-1',
				time: 1_784_246_400,
				size_bytes: 1024,
				age_seconds: 3600,
			},
			base_backup_count: 3,
			wal_count: 42,
			total_size_bytes: 5_000_000_000,
			oldest_object_age_seconds: 604_800,
			retention_days: 7,
			retention_ok: true,
			generated_at: 1_784_250_000,
		};

		it('derives Total Size from the authoritative summary, not the loaded page', () => {
			const items = [
				{ id: 'a', key: 'a', size: 10, lastModified: '', age: '' },
			] as any[];
			const stats = kilobaseBackupLens.stats!(items, summary);
			const sizeStat = stats.find((s) => s.id === 'size');
			expect(sizeStat?.value).toBe('4.66 GB');
		});

		it('adds a Latest Backup Age stat from summary.latest_base_backup', () => {
			const stats = kilobaseBackupLens.stats!([], summary);
			const ageStat = stats.find((s) => s.id === 'latest_age');
			expect(ageStat?.value).toBe('1h');
			expect(ageStat?.tone).toBeUndefined();
		});

		it('flags a missing latest_base_backup as "none" with danger tone', () => {
			const stats = kilobaseBackupLens.stats!([], {
				...summary,
				latest_base_backup: null,
			});
			const ageStat = stats.find((s) => s.id === 'latest_age');
			expect(ageStat?.value).toBe('none');
			expect(ageStat?.tone).toBe('danger');
		});

		it('falls back to page-derived stats when no summary is available', () => {
			const items = [
				{ id: 'a', key: 'a', size: 2048, lastModified: '', age: '' },
			] as any[];
			const stats = kilobaseBackupLens.stats!(items, undefined);
			expect(stats.find((s) => s.id === 'latest_age')).toBeUndefined();
			expect(stats.find((s) => s.id === 'size')?.value).toBe('2.0 KB');
		});
	});
});

describe('formatDuration', () => {
	it('formats sub-minute durations in seconds', () => {
		expect(formatDuration(30)).toBe('30s');
	});

	it('formats sub-hour durations in minutes', () => {
		expect(formatDuration(600)).toBe('10m');
	});

	it('formats sub-day durations in hours', () => {
		expect(formatDuration(21_600)).toBe('6h');
	});

	it('formats multi-day durations in days', () => {
		expect(formatDuration(172_800)).toBe('2d');
	});
});
