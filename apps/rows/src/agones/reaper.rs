use chrono::NaiveDateTime;
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReapReason {
    /// Allocated but never sent a heartbeat within the boot grace window (crash/legacy/id-bug).
    NeverReported,
    /// Reported 0 players for longer than its per-map empty timeout (+ buffer).
    Empty,
    /// Still claims players but its heartbeat went silent past the stale window — crashed while
    /// populated (e.g. SIGSEGV-on-login), so its positive count is a lie and join_map would
    /// route new players onto a corpse.
    Stale,
}

/// Pure policy: should this instance be torn down, and why?
/// `None` = keep. The server's own `SDK.Shutdown()` is the primary path; this is the backstop.
#[allow(clippy::too_many_arguments)]
pub fn reap_decision(
    player_count: i32,
    last_update_from_server: Option<NaiveDateTime>,
    last_server_empty_date: Option<NaiveDateTime>,
    create_date: Option<NaiveDateTime>,
    minutes_to_shutdown_after_empty: i32,
    boot_grace_secs: i64,
    empty_buffer_secs: i64,
    stale_secs: i64,
    min_empty_secs: i64,
    allow_never_reported: bool,
    now: NaiveDateTime,
) -> Option<ReapReason> {
    if player_count > 0 {
        // Layer 5: crashed-while-populated. The instance still claims players, but its heartbeat
        // has gone silent past `stale_secs` — once heartbeats are reliably live (opt-in
        // `stale_secs > 0`), that gap means the server died with players "present". Gated off by
        // default because a *global* heartbeat outage would otherwise make every live server look
        // stale; only enable once heartbeat delivery is trusted.
        if stale_secs > 0 {
            if let Some(last) = last_update_from_server {
                if (now - last).num_seconds() > stale_secs {
                    return Some(ReapReason::Stale);
                }
            }
        }
        return None;
    }

    // Layer 4: never heard from it, and it's older than the boot grace window.
    // GATED: without a live heartbeat, *every* instance looks never-reported (including full
    // ones), so this stays off until heartbeats are confirmed live in the target env.
    if last_update_from_server.is_none() {
        if allow_never_reported {
            if let Some(created) = create_date {
                if (now - created).num_seconds() > boot_grace_secs {
                    return Some(ReapReason::NeverReported);
                }
            }
        }
        return None;
    }

    // Layer 3: empty for longer than its per-map timeout (+ buffer so the server self-shuts first).
    // The effective limit is floored at `min_empty_secs` so a freshly allocated server isn't
    // reaped under a still-loading player even if a map is misconfigured with a tiny timeout
    // (UE5 map travel + asset streaming can exceed a 1-minute timeout).
    if let Some(empty_since) = last_server_empty_date {
        let limit = ((minutes_to_shutdown_after_empty.max(0) as i64) * 60 + empty_buffer_secs)
            .max(min_empty_secs);
        if (now - empty_since).num_seconds() > limit {
            return Some(ReapReason::Empty);
        }
    }
    None
}

/// Splits a batch of reap "misses" — candidates the in-memory `zone_servers` map couldn't name —
/// against the GameServer names resolved from the DB, into:
///   - `targets`: `(instance_id, gs_name, reason)` ready for deallocate-first teardown.
///   - `unresolved`: `(instance_id, reason)` with no resolvable name (NULL column, or a row the DB
///     batch didn't return) — nothing to deallocate, so the caller takes the terminal `status=0`
///     path with a one-time warn.
///
/// Pure (no DB/Agones) so the miss-resolution + terminal-state branch is unit-testable; the caller
/// owns IO (the DB batch lookup feeding `resolved`, and the teardown/status flip on the results).
/// A DB error must NOT reach here as an empty `resolved` map — that would misclassify every miss as
/// unresolved and mass-flip live rows to `status=0`; the caller skips this call entirely on error.
#[allow(clippy::type_complexity)]
pub fn resolve_misses(
    misses: Vec<(i32, ReapReason)>,
    resolved: &HashMap<i32, Option<String>>,
) -> (Vec<(i32, String, ReapReason)>, Vec<(i32, ReapReason)>) {
    let mut targets = Vec::new();
    let mut unresolved = Vec::new();
    for (id, reason) in misses {
        match resolved.get(&id).cloned().flatten() {
            Some(gs) => targets.push((id, gs, reason)),
            None => unresolved.push((id, reason)),
        }
    }
    (targets, unresolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").unwrap()
    }

    // never-reported allowed: NULL last_update, created longer ago than boot grace -> reap
    #[test]
    fn never_reported_past_grace_is_reaped_when_allowed() {
        let now = ts("2026-06-23 12:00:00");
        let created = ts("2026-06-23 11:40:00"); // 20 min ago
        let d = reap_decision(0, None, None, Some(created), 1, 600, 30, 0, 0, true, now);
        assert_eq!(d, Some(ReapReason::NeverReported));
    }

    // never-reported but gating OFF -> keep (the dangerous default; protects populated servers)
    #[test]
    fn never_reported_is_kept_when_gated_off() {
        let now = ts("2026-06-23 12:00:00");
        let created = ts("2026-06-23 11:40:00"); // 20 min ago, well past grace
        let d = reap_decision(0, None, None, Some(created), 1, 600, 30, 0, 0, false, now);
        assert_eq!(d, None);
    }

    // never-reported but still inside boot grace -> keep
    #[test]
    fn never_reported_within_grace_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let created = ts("2026-06-23 11:55:00"); // 5 min ago, grace 10 min
        let d = reap_decision(0, None, Some(ts("2026-06-23 11:55:00")), Some(created), 1, 600, 30, 0, 0, true, now);
        assert_eq!(d, None);
    }

    // empty long enough past minutes+buffer -> reap (count-based, independent of never-reported gate)
    #[test]
    fn empty_past_timeout_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:58:00"); // empty 120s; 1 min(60s)+30s buffer = 90s
        let d = reap_decision(0, Some(now), Some(empty_since), Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 0, 0, false, now);
        assert_eq!(d, Some(ReapReason::Empty));
    }

    // empty but not yet past minutes+buffer -> keep (server gets first crack)
    #[test]
    fn empty_within_timeout_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:59:30"); // empty 30s < 90s
        let d = reap_decision(0, Some(now), Some(empty_since), Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 0, 0, false, now);
        assert_eq!(d, None);
    }

    // has players -> never reaped, even if empty marker is stale
    #[test]
    fn populated_is_never_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let d = reap_decision(5, Some(now), None, Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 0, 0, true, now);
        assert_eq!(d, None);
    }

    // reported (last_update set), empty marker NULL, has 0 players but no empty-since yet -> keep
    #[test]
    fn zero_players_without_empty_marker_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let d = reap_decision(0, Some(now), None, Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 0, 0, true, now);
        assert_eq!(d, None);
    }

    // MEDIUM 4: still claims players but heartbeat is stale past stale_secs -> reap (Stale)
    #[test]
    fn stale_populated_is_reaped_when_enabled() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:56:40"); // 200s ago > stale_secs 120
        let d = reap_decision(5, Some(last), None, Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 120, 0, false, now);
        assert_eq!(d, Some(ReapReason::Stale));
    }

    // stale rule gated off (stale_secs = 0) -> a stale-but-populated server is kept
    #[test]
    fn stale_populated_is_kept_when_disabled() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:56:40"); // 200s ago, but stale_secs 0 = off
        let d = reap_decision(5, Some(last), None, Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 0, 0, false, now);
        assert_eq!(d, None);
    }

    // populated with a recent heartbeat -> kept even when the stale rule is on
    #[test]
    fn populated_with_recent_heartbeat_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:59:00"); // 60s ago < stale_secs 120
        let d = reap_decision(5, Some(last), None, Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 120, 0, false, now);
        assert_eq!(d, None);
    }

    // MEDIUM 5: empty past its tiny per-map timeout but still within the min-empty floor -> keep
    #[test]
    fn empty_within_floor_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:58:00"); // empty 120s; limit max(90, 300) = 300
        let d = reap_decision(0, Some(now), Some(empty_since), Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 0, 300, false, now);
        assert_eq!(d, None);
    }

    // empty past the floor -> reap (floor doesn't block a genuinely long-empty server)
    #[test]
    fn empty_past_floor_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:53:20"); // empty 400s > floor 300
        let d = reap_decision(0, Some(now), Some(empty_since), Some(ts("2026-06-23 10:00:00")), 1, 600, 30, 0, 300, false, now);
        assert_eq!(d, Some(ReapReason::Empty));
    }

    // resolve_misses: a row whose DB lookup returned a name -> teardown target
    #[test]
    fn resolve_misses_named_becomes_target() {
        let resolved = HashMap::from([(1, Some("gs-alpha".to_string()))]);
        let (targets, unresolved) = resolve_misses(vec![(1, ReapReason::Empty)], &resolved);
        assert_eq!(targets, vec![(1, "gs-alpha".to_string(), ReapReason::Empty)]);
        assert!(unresolved.is_empty());
    }

    // resolve_misses: a row present with a NULL name -> terminal (no GameServer to deallocate)
    #[test]
    fn resolve_misses_null_name_is_unresolved() {
        let resolved = HashMap::from([(2, None)]);
        let (targets, unresolved) = resolve_misses(vec![(2, ReapReason::NeverReported)], &resolved);
        assert!(targets.is_empty());
        assert_eq!(unresolved, vec![(2, ReapReason::NeverReported)]);
    }

    // resolve_misses: a row the DB batch didn't return at all -> terminal (treated as no-name)
    #[test]
    fn resolve_misses_absent_row_is_unresolved() {
        let resolved = HashMap::new();
        let (targets, unresolved) = resolve_misses(vec![(3, ReapReason::Stale)], &resolved);
        assert!(targets.is_empty());
        assert_eq!(unresolved, vec![(3, ReapReason::Stale)]);
    }

    // resolve_misses: mixed batch is partitioned correctly, order preserved within each bucket
    #[test]
    fn resolve_misses_mixed_batch_partitions() {
        let resolved = HashMap::from([
            (1, Some("gs-a".to_string())),
            (2, None),
            (4, Some("gs-d".to_string())),
        ]);
        let misses = vec![
            (1, ReapReason::Empty),
            (2, ReapReason::Empty),
            (3, ReapReason::NeverReported), // absent from resolved
            (4, ReapReason::Stale),
        ];
        let (targets, unresolved) = resolve_misses(misses, &resolved);
        assert_eq!(
            targets,
            vec![
                (1, "gs-a".to_string(), ReapReason::Empty),
                (4, "gs-d".to_string(), ReapReason::Stale),
            ]
        );
        assert_eq!(
            unresolved,
            vec![(2, ReapReason::Empty), (3, ReapReason::NeverReported)]
        );
    }
}
