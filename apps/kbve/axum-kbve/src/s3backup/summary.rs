use serde::Serialize;
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct S3Object {
    pub key: String,
    pub size: i64,
    pub last_modified: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct BaseBackup {
    pub id: String,
    pub time: i64,
    pub size_bytes: i64,
    pub age_seconds: i64,
}

#[derive(Serialize, Debug)]
pub struct BackupSummary {
    pub latest_base_backup: Option<BaseBackup>,
    pub base_backup_count: u64,
    pub wal_count: u64,
    pub total_size_bytes: i64,
    pub oldest_object_age_seconds: i64,
    pub retention_days: u32,
    pub retention_ok: bool,
    pub generated_at: i64,
}

fn base_id(key: &str) -> Option<String> {
    let idx = key.find("/base/")?;
    let rest = &key[idx + "/base/".len()..];
    let id = rest.split('/').next()?;
    if id.is_empty() { None } else { Some(id.to_string()) }
}

pub fn summarize(objects: &[S3Object], _prefix: &str, now: i64, retention_days: u32) -> BackupSummary {
    let mut bases: HashMap<String, (i64, i64)> = HashMap::new();
    let mut wal_count: u64 = 0;
    let mut total: i64 = 0;
    let mut oldest_ts = i64::MAX;

    for o in objects {
        total += o.size;
        if o.last_modified < oldest_ts {
            oldest_ts = o.last_modified;
        }
        if let Some(id) = base_id(&o.key) {
            let e = bases.entry(id).or_insert((0, 0));
            e.0 += o.size;
            if o.last_modified > e.1 {
                e.1 = o.last_modified;
            }
        } else if o.key.contains("/wals/") {
            wal_count += 1;
        }
    }

    let latest = bases
        .iter()
        .max_by_key(|(_, (_, t))| *t)
        .map(|(id, (size, t))| BaseBackup {
            id: id.clone(),
            time: *t,
            size_bytes: *size,
            age_seconds: now - *t,
        });

    let retention_window = retention_days as i64 * 86400;
    let retention_ok = latest
        .as_ref()
        .map(|b| b.age_seconds <= retention_window)
        .unwrap_or(false);

    BackupSummary {
        latest_base_backup: latest,
        base_backup_count: bases.len() as u64,
        wal_count,
        total_size_bytes: total,
        oldest_object_age_seconds: if oldest_ts == i64::MAX { 0 } else { now - oldest_ts },
        retention_days,
        retention_ok,
        generated_at: now,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn obj(key: &str, size: i64, ts: i64) -> S3Object {
        S3Object { key: key.to_string(), size, last_modified: ts }
    }

    #[test]
    fn classifies_base_and_wal_and_reports_latest() {
        let objs = vec![
            obj("barman/backup/base/20260718T040000/data.tar.gz", 1000, 1_000_000),
            obj("barman/backup/base/20260718T040000/pgdata.tar.gz", 200, 1_000_050),
            obj("barman/backup/base/20260711T040000/data.tar.gz", 800, 400_000),
            obj("barman/backup/wals/000000010000000000000001", 16, 1_000_100),
            obj("barman/backup/wals/000000010000000000000002", 16, 1_000_200),
        ];
        let now = 1_000_300;
        let s = summarize(&objs, "barman/backup/", now, 7);
        assert_eq!(s.base_backup_count, 2);
        assert_eq!(s.wal_count, 2);
        assert_eq!(s.total_size_bytes, 1000 + 200 + 800 + 16 + 16);
        let latest = s.latest_base_backup.unwrap();
        assert_eq!(latest.id, "20260718T040000");
        assert_eq!(latest.size_bytes, 1200);
        assert_eq!(latest.time, 1_000_050);
        assert_eq!(latest.age_seconds, 250);
    }

    #[test]
    fn retention_ok_true_when_latest_base_within_window() {
        let now = 10 * 86400;
        let objs = vec![
            obj("barman/backup/base/recent/data.tar.gz", 1, 6 * 86400),
            obj("barman/backup/wals/x", 1, 6 * 86400),
        ];
        let s = summarize(&objs, "barman/backup/", now, 7);
        assert!(s.retention_ok);
    }

    #[test]
    fn retention_ok_false_when_latest_base_stale() {
        let now = 10 * 86400;
        let objs = vec![obj("barman/backup/base/old/data.tar.gz", 1, 1 * 86400)];
        let s = summarize(&objs, "barman/backup/", now, 7);
        assert!(!s.retention_ok);
    }

    #[test]
    fn retention_ok_false_when_wal_only_no_base() {
        let now = 10 * 86400;
        let objs = vec![obj("barman/backup/wals/x", 1, 6 * 86400)];
        let s = summarize(&objs, "barman/backup/", now, 7);
        assert!(!s.retention_ok);
    }

    #[test]
    fn empty_yields_null_latest_and_not_ok() {
        let s = summarize(&[], "barman/backup/", 100, 7);
        assert!(s.latest_base_backup.is_none());
        assert_eq!(s.base_backup_count, 0);
        assert!(!s.retention_ok);
    }
}
