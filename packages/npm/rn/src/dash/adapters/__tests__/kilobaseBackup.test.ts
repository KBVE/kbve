import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	retentionBadge,
	mapObjectsResponse,
	kilobaseBackupLens,
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
				time: '2026-07-17T00:00:00Z',
				size_bytes: 1024,
				age_seconds: 3600,
			},
			base_backup_count: 3,
			wal_count: 42,
			total_size_bytes: 1_000_000,
			oldest_object_age_seconds: 604_800,
			retention_days: 7,
			retention_ok: true,
			generated_at: '2026-07-17T01:00:00Z',
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
						last_modified: '2026-07-17T00:00:00Z',
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
				lastModified: '2026-07-17T00:00:00Z',
			});
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
	});
});
