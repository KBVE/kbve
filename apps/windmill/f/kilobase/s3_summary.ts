export type S3Object = {
  key: string;
  size: number;
  lastModified: number;
};

export type BaseBackup = {
  id: string;
  time: number;
  size_bytes: number;
  age_seconds: number;
};

export type BackupSummary = {
  latest_base_backup: BaseBackup | null;
  base_backup_count: number;
  wal_count: number;
  total_size_bytes: number;
  oldest_object_age_seconds: number;
  retention_days: number;
  retention_ok: boolean;
  generated_at: number;
};

function baseId(key: string): string | null {
  const idx = key.indexOf("/base/");
  if (idx === -1) return null;
  const rest = key.slice(idx + "/base/".length);
  const id = rest.split("/")[0];
  return id ? id : null;
}

export function summarize(
  objects: S3Object[],
  now: number,
  retentionDays: number,
): BackupSummary {
  const bases = new Map<string, { size: number; time: number }>();
  let walCount = 0;
  let total = 0;
  let oldestTs: number | null = null;

  for (const o of objects) {
    total += o.size;
    if (oldestTs === null || o.lastModified < oldestTs) {
      oldestTs = o.lastModified;
    }

    const id = baseId(o.key);
    if (id !== null) {
      const e = bases.get(id) ?? { size: 0, time: 0 };
      e.size += o.size;
      if (o.lastModified > e.time) e.time = o.lastModified;
      bases.set(id, e);
    } else if (o.key.includes("/wals/")) {
      walCount += 1;
    }
  }

  let latest: BaseBackup | null = null;
  for (const [id, { size, time }] of bases) {
    if (latest === null || time > latest.time) {
      latest = { id, time, size_bytes: size, age_seconds: now - time };
    }
  }

  const retentionWindow = retentionDays * 86400;
  const retentionOk = latest !== null && latest.age_seconds <= retentionWindow;

  return {
    latest_base_backup: latest,
    base_backup_count: bases.size,
    wal_count: walCount,
    total_size_bytes: total,
    oldest_object_age_seconds: oldestTs === null ? 0 : now - oldestTs,
    retention_days: retentionDays,
    retention_ok: retentionOk,
    generated_at: now,
  };
}
