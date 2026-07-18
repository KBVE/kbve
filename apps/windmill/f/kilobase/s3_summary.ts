export type S3Object = {
  key: string;
  size: number;
  lastModified: number;
};

export type BaseBackup = {
  id: string;
  time: number;
  sizeBytes: number;
  ageSeconds: number;
};

export type BackupSummary = {
  latestBaseBackup: BaseBackup | null;
  baseBackupCount: number;
  walCount: number;
  totalSizeBytes: number;
  oldestObjectAgeSeconds: number;
  retentionDays: number;
  retentionOk: boolean;
  generatedAt: number;
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
      latest = { id, time, sizeBytes: size, ageSeconds: now - time };
    }
  }

  const retentionWindow = retentionDays * 86400;
  const retentionOk = latest !== null && latest.ageSeconds <= retentionWindow;

  return {
    latestBaseBackup: latest,
    baseBackupCount: bases.size,
    walCount,
    totalSizeBytes: total,
    oldestObjectAgeSeconds: oldestTs === null ? 0 : now - oldestTs,
    retentionDays,
    retentionOk,
    generatedAt: now,
  };
}
