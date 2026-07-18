import { describe, expect, test } from "bun:test";
import { summarize, type S3Object } from "./s3_summary.ts";

function obj(key: string, size: number, lastModified: number): S3Object {
  return { key, size, lastModified };
}

describe("summarize", () => {
  test("classifies base+WAL, reports latest", () => {
    const objects = [
      obj("barman/backup/base/20260718T040000/data.tar.gz", 1000, 1_000_000),
      obj("barman/backup/base/20260718T040000/pgdata.tar.gz", 200, 1_000_050),
      obj("barman/backup/base/20260711T040000/data.tar.gz", 800, 400_000),
      obj("barman/backup/wals/000000010000000000000001", 16, 1_000_100),
      obj("barman/backup/wals/000000010000000000000002", 16, 1_000_200),
    ];
    const now = 1_000_300;
    const s = summarize(objects, now, 7);

    expect(s.base_backup_count).toBe(2);
    expect(s.wal_count).toBe(2);
    expect(s.total_size_bytes).toBe(1000 + 200 + 800 + 16 + 16);
    expect(s.latest_base_backup).not.toBeNull();
    expect(s.latest_base_backup?.id).toBe("20260718T040000");
    expect(s.latest_base_backup?.size_bytes).toBe(1200);
    expect(s.latest_base_backup?.time).toBe(1_000_050);
    expect(s.latest_base_backup?.age_seconds).toBe(250);
  });

  test("retentionOk true when latest base within window", () => {
    const now = 10 * 86400;
    const objects = [
      obj("barman/backup/base/recent/data.tar.gz", 1, 6 * 86400),
      obj("barman/backup/wals/x", 1, 6 * 86400),
    ];
    const s = summarize(objects, now, 7);
    expect(s.retention_ok).toBe(true);
  });

  test("retentionOk false when latest base stale", () => {
    const now = 10 * 86400;
    const objects = [obj("barman/backup/base/old/data.tar.gz", 1, 1 * 86400)];
    const s = summarize(objects, now, 7);
    expect(s.retention_ok).toBe(false);
  });

  test("retentionOk false when wal-only (no base)", () => {
    const now = 10 * 86400;
    const objects = [obj("barman/backup/wals/x", 1, 6 * 86400)];
    const s = summarize(objects, now, 7);
    expect(s.retention_ok).toBe(false);
  });

  test("empty yields null latest, zero counts, retentionOk false", () => {
    const s = summarize([], 100, 7);
    expect(s.latest_base_backup).toBeNull();
    expect(s.base_backup_count).toBe(0);
    expect(s.retention_ok).toBe(false);
  });
});
