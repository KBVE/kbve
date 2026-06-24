use chrono::NaiveDateTime;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReapReason {
    /// Allocated but never sent a heartbeat within the boot grace window (crash/legacy/id-bug).
    NeverReported,
    /// Reported 0 players for longer than its per-map empty timeout (+ buffer).
    Empty,
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
    allow_never_reported: bool,
    now: NaiveDateTime,
) -> Option<ReapReason> {
    // A populated server is never reaped here.
    if player_count > 0 {
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
    if let Some(empty_since) = last_server_empty_date {
        let limit = (minutes_to_shutdown_after_empty.max(0) as i64) * 60 + empty_buffer_secs;
        if (now - empty_since).num_seconds() > limit {
            return Some(ReapReason::Empty);
        }
    }
    None
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
        let d = reap_decision(0, None, None, Some(created), 1, 600, 30, true, now);
        assert_eq!(d, Some(ReapReason::NeverReported));
    }

    // never-reported but gating OFF -> keep (the dangerous default; protects populated servers)
    #[test]
    fn never_reported_is_kept_when_gated_off() {
        let now = ts("2026-06-23 12:00:00");
        let created = ts("2026-06-23 11:40:00"); // 20 min ago, well past grace
        let d = reap_decision(0, None, None, Some(created), 1, 600, 30, false, now);
        assert_eq!(d, None);
    }

    // never-reported but still inside boot grace -> keep
    #[test]
    fn never_reported_within_grace_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let created = ts("2026-06-23 11:55:00"); // 5 min ago, grace 10 min
        let d = reap_decision(0, None, Some(ts("2026-06-23 11:55:00")), Some(created), 1, 600, 30, true, now);
        assert_eq!(d, None);
    }

    // empty long enough past minutes+buffer -> reap (count-based, independent of never-reported gate)
    #[test]
    fn empty_past_timeout_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:58:00"); // empty 120s; 1 min(60s)+30s buffer = 90s
        let d = reap_decision(0, Some(now), Some(empty_since), Some(ts("2026-06-23 10:00:00")), 1, 600, 30, false, now);
        assert_eq!(d, Some(ReapReason::Empty));
    }

    // empty but not yet past minutes+buffer -> keep (server gets first crack)
    #[test]
    fn empty_within_timeout_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:59:30"); // empty 30s < 90s
        let d = reap_decision(0, Some(now), Some(empty_since), Some(ts("2026-06-23 10:00:00")), 1, 600, 30, false, now);
        assert_eq!(d, None);
    }

    // has players -> never reaped, even if empty marker is stale
    #[test]
    fn populated_is_never_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let d = reap_decision(5, Some(now), None, Some(ts("2026-06-23 10:00:00")), 1, 600, 30, true, now);
        assert_eq!(d, None);
    }

    // reported (last_update set), empty marker NULL, has 0 players but no empty-since yet -> keep
    #[test]
    fn zero_players_without_empty_marker_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let d = reap_decision(0, Some(now), None, Some(ts("2026-06-23 10:00:00")), 1, 600, 30, true, now);
        assert_eq!(d, None);
    }
}
