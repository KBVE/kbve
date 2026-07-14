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

/// Inputs to [`reap_decision`]. A named struct rather than a 14-arg positional call: the original
/// signature packed several adjacent `i64`/`bool`/`Option<NaiveDateTime>` params (`stale_secs`,
/// `min_empty_secs`, `allow_never_reported`, `empty_fresh_secs`, `is_draining`, `drain_deadline`),
/// any two of which could be silently transposed at a call site with no type error. All fields are
/// `Copy`, so `reap_decision` destructures by value and the policy body is unchanged.
#[derive(Debug, Clone, Copy)]
pub struct ReapInputs {
    pub player_count: i32,
    pub last_update_from_server: Option<NaiveDateTime>,
    pub last_server_empty_date: Option<NaiveDateTime>,
    pub create_date: Option<NaiveDateTime>,
    pub minutes_to_shutdown_after_empty: i32,
    pub boot_grace_secs: i64,
    pub empty_buffer_secs: i64,
    pub stale_secs: i64,
    pub min_empty_secs: i64,
    pub allow_never_reported: bool,
    pub empty_fresh_secs: i64,
    pub is_draining: bool,
    pub drain_deadline: Option<NaiveDateTime>,
    pub now: NaiveDateTime,
}

/// Pure policy: should this instance be torn down, and why?
/// `None` = keep. The server's own `SDK.Shutdown()` is the primary path; this is the backstop.
pub fn reap_decision(i: &ReapInputs) -> Option<ReapReason> {
    let &ReapInputs {
        player_count,
        last_update_from_server,
        last_server_empty_date,
        create_date,
        minutes_to_shutdown_after_empty,
        boot_grace_secs,
        empty_buffer_secs,
        stale_secs,
        min_empty_secs,
        allow_never_reported,
        empty_fresh_secs,
        is_draining,
        drain_deadline,
        now,
    } = i;

    // Drain deadline is a HARD cutoff and must win regardless of player count. A drain the server
    // ignores — still holding players past its `drain_deadline` — is exactly the case the deadline
    // exists for, so it is checked BEFORE the populated short-circuit below (which would otherwise
    // `return None` for a fresh, populated server and let it outlive its deadline). The empty case is
    // covered here too, so the in-`is_draining` block below no longer repeats this check.
    if is_draining {
        if let Some(deadline) = drain_deadline {
            if now > deadline {
                return Some(ReapReason::Stale);
            }
        }
    }

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

    // Draining: going empty is the GOAL and UE owns SDK.Shutdown(), so the count-based Empty /
    // NeverReported paths below are suppressed. BUT a draining server can still die mid/post-drain,
    // so a lost-liveness backstop keeps here (the deadline backstop already fired above, before the
    // populated short-circuit). This closes the orphan-leak a blanket exemption would create — a
    // crashed-while-empty draining server would otherwise stay exempt forever:
    if is_draining {
        // Lost-liveness: when the freshness gate is active, a draining server whose heartbeat
        // went stale has crashed — reap it. When the gate is off (empty_fresh_secs == 0) there is no
        // trusted liveness signal, so exempt and let the deadline / v2 cross-check act.
        if empty_fresh_secs > 0 {
            match last_update_from_server {
                // alive + draining -> exempt
                Some(last) if (now - last).num_seconds() <= empty_fresh_secs => {}
                // had a heartbeat that then went stale -> crashed mid-drain
                Some(_) => return Some(ReapReason::Stale),
                // never reported: respect boot grace before declaring it crashed (mirrors the
                // non-draining never-reported path). A server told to drain during boot may not have
                // sent its first heartbeat yet; only past boot grace is a missing heartbeat a crash.
                None => {
                    if let Some(created) = create_date {
                        if (now - created).num_seconds() > boot_grace_secs {
                            return Some(ReapReason::Stale);
                        }
                    }
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
        // Freshness gate (silence != empty): only trust the empty marker if the heartbeat is
        // recent. A wedged/crashed UE heartbeat freezes `numberofreportedplayers` at a stale `0`
        // while players may have reconnected out-of-band; honoring that frozen marker would
        // hard-deallocate a populated-but-silent server (the documented chuck login-crash path).
        // When `empty_fresh_secs > 0`, require `last_update` within the window; otherwise keep
        // (uncertain) and let the unresponsive paths / v2 Agones-health cross-check handle a
        // genuinely dead one.
        if empty_fresh_secs > 0 {
            let fresh = matches!(
                last_update_from_server,
                Some(last) if (now - last).num_seconds() <= empty_fresh_secs
            );
            if !fresh {
                return None;
            }
        }
        let limit = ((minutes_to_shutdown_after_empty.max(0) as i64) * 60 + empty_buffer_secs)
            .max(min_empty_secs);
        if (now - empty_since).num_seconds() > limit {
            return Some(ReapReason::Empty);
        }
    }
    None
}

/// True when an empty (0-player, empty-marker-set) instance is being RETAINED *purely* because its
/// heartbeat is stale relative to `empty_fresh_secs` — i.e. the freshness gate is the only thing
/// blocking its Empty reap. The caller sums this per cycle and logs it so a misconfigured
/// `empty_fresh_secs < heartbeat_interval` (which makes the Empty reap silently never fire) shows up
/// instead of looking like "nothing to reap". A NULL `last_update` is the never-reported path, not
/// this gate.
pub fn retained_due_to_stale_heartbeat(
    player_count: i32,
    last_update_from_server: Option<NaiveDateTime>,
    last_server_empty_date: Option<NaiveDateTime>,
    empty_fresh_secs: i64,
    now: NaiveDateTime,
) -> bool {
    if player_count != 0 || empty_fresh_secs <= 0 || last_server_empty_date.is_none() {
        return false;
    }
    match last_update_from_server {
        Some(last) => (now - last).num_seconds() > empty_fresh_secs,
        None => false, // NULL last_update is the never-reported path, not the freshness gate
    }
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

    /// Neutral baseline: 0 players, no heartbeat/empty marker, gates off, not draining. Each test
    /// overrides only the fields it exercises via `..base(now)`, so a test reads as the delta from
    /// "nothing reapable" — and there are no positional args to transpose.
    fn base(now: NaiveDateTime) -> ReapInputs {
        ReapInputs {
            player_count: 0,
            last_update_from_server: None,
            last_server_empty_date: None,
            create_date: None,
            minutes_to_shutdown_after_empty: 1,
            boot_grace_secs: 600,
            empty_buffer_secs: 30,
            stale_secs: 0,
            min_empty_secs: 0,
            allow_never_reported: false,
            empty_fresh_secs: 0,
            is_draining: false,
            drain_deadline: None,
            now,
        }
    }

    // never-reported allowed: NULL last_update, created longer ago than boot grace -> reap
    #[test]
    fn never_reported_past_grace_is_reaped_when_allowed() {
        let now = ts("2026-06-23 12:00:00");
        let created = ts("2026-06-23 11:40:00"); // 20 min ago
        let d = reap_decision(&ReapInputs {
            create_date: Some(created),
            allow_never_reported: true,
            ..base(now)
        });
        assert_eq!(d, Some(ReapReason::NeverReported));
    }

    // never-reported but gating OFF -> keep (the dangerous default; protects populated servers)
    #[test]
    fn never_reported_is_kept_when_gated_off() {
        let now = ts("2026-06-23 12:00:00");
        let created = ts("2026-06-23 11:40:00"); // 20 min ago, well past grace
        let d = reap_decision(&ReapInputs {
            create_date: Some(created),
            ..base(now)
        });
        assert_eq!(d, None);
    }

    // never-reported but still inside boot grace -> keep
    #[test]
    fn never_reported_within_grace_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let created = ts("2026-06-23 11:55:00"); // 5 min ago, grace 10 min
        let d = reap_decision(&ReapInputs {
            last_server_empty_date: Some(ts("2026-06-23 11:55:00")),
            create_date: Some(created),
            allow_never_reported: true,
            ..base(now)
        });
        assert_eq!(d, None);
    }

    // empty long enough past minutes+buffer -> reap (count-based, independent of never-reported gate)
    #[test]
    fn empty_past_timeout_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:58:00"); // empty 120s; 1 min(60s)+30s buffer = 90s
        let d = reap_decision(&ReapInputs {
            last_update_from_server: Some(now),
            last_server_empty_date: Some(empty_since),
            create_date: Some(ts("2026-06-23 10:00:00")),
            ..base(now)
        });
        assert_eq!(d, Some(ReapReason::Empty));
    }

    // empty but not yet past minutes+buffer -> keep (server gets first crack)
    #[test]
    fn empty_within_timeout_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:59:30"); // empty 30s < 90s
        let d = reap_decision(&ReapInputs {
            last_update_from_server: Some(now),
            last_server_empty_date: Some(empty_since),
            create_date: Some(ts("2026-06-23 10:00:00")),
            ..base(now)
        });
        assert_eq!(d, None);
    }

    // has players -> never reaped, even if empty marker is stale
    #[test]
    fn populated_is_never_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let d = reap_decision(&ReapInputs {
            player_count: 5,
            last_update_from_server: Some(now),
            create_date: Some(ts("2026-06-23 10:00:00")),
            allow_never_reported: true,
            ..base(now)
        });
        assert_eq!(d, None);
    }

    // reported (last_update set), empty marker NULL, has 0 players but no empty-since yet -> keep
    #[test]
    fn zero_players_without_empty_marker_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let d = reap_decision(&ReapInputs {
            last_update_from_server: Some(now),
            create_date: Some(ts("2026-06-23 10:00:00")),
            allow_never_reported: true,
            ..base(now)
        });
        assert_eq!(d, None);
    }

    // still claims players but heartbeat is stale past stale_secs -> reap (Stale)
    #[test]
    fn stale_populated_is_reaped_when_enabled() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:56:40"); // 200s ago > stale_secs 120
        let d = reap_decision(&ReapInputs {
            player_count: 5,
            last_update_from_server: Some(last),
            create_date: Some(ts("2026-06-23 10:00:00")),
            stale_secs: 120,
            ..base(now)
        });
        assert_eq!(d, Some(ReapReason::Stale));
    }

    // stale rule gated off (stale_secs = 0) -> a stale-but-populated server is kept
    #[test]
    fn stale_populated_is_kept_when_disabled() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:56:40"); // 200s ago, but stale_secs 0 = off
        let d = reap_decision(&ReapInputs {
            player_count: 5,
            last_update_from_server: Some(last),
            create_date: Some(ts("2026-06-23 10:00:00")),
            ..base(now)
        });
        assert_eq!(d, None);
    }

    // populated with a recent heartbeat -> kept even when the stale rule is on
    #[test]
    fn populated_with_recent_heartbeat_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:59:00"); // 60s ago < stale_secs 120
        let d = reap_decision(&ReapInputs {
            player_count: 5,
            last_update_from_server: Some(last),
            create_date: Some(ts("2026-06-23 10:00:00")),
            stale_secs: 120,
            ..base(now)
        });
        assert_eq!(d, None);
    }

    // empty past its tiny per-map timeout but still within the min-empty floor -> keep
    #[test]
    fn empty_within_floor_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:58:00"); // empty 120s; limit max(90, 300) = 300
        let d = reap_decision(&ReapInputs {
            last_update_from_server: Some(now),
            last_server_empty_date: Some(empty_since),
            create_date: Some(ts("2026-06-23 10:00:00")),
            min_empty_secs: 300,
            ..base(now)
        });
        assert_eq!(d, None);
    }

    // empty past the floor -> reap (floor doesn't block a genuinely long-empty server)
    #[test]
    fn empty_past_floor_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:53:20"); // empty 400s > floor 300
        let d = reap_decision(&ReapInputs {
            last_update_from_server: Some(now),
            last_server_empty_date: Some(empty_since),
            create_date: Some(ts("2026-06-23 10:00:00")),
            min_empty_secs: 300,
            ..base(now)
        });
        assert_eq!(d, Some(ReapReason::Empty));
    }

    // empty marker set but the heartbeat is STALE -> NOT reaped. The frozen `0` may be a lie (UE
    // heartbeat wedged while players reconnected out-of-band); don't trust a stale marker.
    #[test]
    fn empty_with_stale_heartbeat_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:55:00"); // 300s ago; empty_fresh_secs 120 -> stale
        let empty_since = ts("2026-06-23 11:50:00"); // empty 600s >> limit
        let d = reap_decision(&ReapInputs {
            last_update_from_server: Some(last),
            last_server_empty_date: Some(empty_since),
            create_date: Some(ts("2026-06-23 10:00:00")),
            empty_fresh_secs: 120,
            ..base(now)
        });
        assert_eq!(d, None);
    }

    // empty marker + FRESH heartbeat past timeout -> reaped (freshness satisfied, count is trusted)
    #[test]
    fn empty_with_fresh_heartbeat_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:59:30"); // 30s ago; fresh within 120
        let empty_since = ts("2026-06-23 11:58:00"); // empty 120s > 90 limit
        let d = reap_decision(&ReapInputs {
            last_update_from_server: Some(last),
            last_server_empty_date: Some(empty_since),
            create_date: Some(ts("2026-06-23 10:00:00")),
            empty_fresh_secs: 120,
            ..base(now)
        });
        assert_eq!(d, Some(ReapReason::Empty));
    }

    // --- Drain exemption (count-based paths suppressed; liveness/deadline backstops still fire) ---

    // draining + empty + FRESH heartbeat (liveness gate on) -> NOT reaped (UE owns the shutdown)
    #[test]
    fn draining_empty_fresh_is_exempt() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:59:00"); // 60s ago, fresh (< 180)
        let empty_since = ts("2026-06-23 11:58:00");
        let d = reap_decision(&ReapInputs {
            last_update_from_server: Some(last),
            last_server_empty_date: Some(empty_since),
            create_date: Some(ts("2026-06-23 10:00:00")),
            empty_fresh_secs: 180,
            is_draining: true,
            ..base(now)
        });
        assert_eq!(d, None);
    }

    // draining + count==0 + STALE heartbeat (the orphan-leak case) -> STILL reaped (lost liveness)
    #[test]
    fn draining_empty_stale_heartbeat_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:55:00"); // 300s ago > empty_fresh 180
        let empty_since = ts("2026-06-23 11:58:00");
        let d = reap_decision(&ReapInputs {
            last_update_from_server: Some(last),
            last_server_empty_date: Some(empty_since),
            create_date: Some(ts("2026-06-23 10:00:00")),
            empty_fresh_secs: 180,
            is_draining: true,
            ..base(now)
        });
        assert_eq!(d, Some(ReapReason::Stale));
    }

    // draining + past drain_deadline -> reaped regardless of freshness
    #[test]
    fn draining_past_deadline_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:59:30"); // fresh
        let deadline = ts("2026-06-23 11:59:00"); // already passed
        let d = reap_decision(&ReapInputs {
            last_update_from_server: Some(last),
            create_date: Some(ts("2026-06-23 10:00:00")),
            empty_fresh_secs: 180,
            is_draining: true,
            drain_deadline: Some(deadline),
            ..base(now)
        });
        assert_eq!(d, Some(ReapReason::Stale));
    }

    // draining + POPULATED (count>0) + fresh heartbeat + past drain_deadline -> STILL reaped. The
    // deadline is a hard cutoff and must beat the populated short-circuit; a server ignoring a drop
    // drain while still holding players past its deadline is exactly what the deadline guards.
    #[test]
    fn draining_populated_past_deadline_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:59:30"); // fresh — without the hoisted deadline this returns None
        let deadline = ts("2026-06-23 11:59:00"); // already passed
        let d = reap_decision(&ReapInputs {
            player_count: 5,
            last_update_from_server: Some(last),
            create_date: Some(ts("2026-06-23 10:00:00")),
            stale_secs: 120, // not stale (30s < 120), so Layer 5 would NOT reap on its own
            empty_fresh_secs: 180,
            is_draining: true,
            drain_deadline: Some(deadline),
            ..base(now)
        });
        assert_eq!(d, Some(ReapReason::Stale));
    }

    // draining + POPULATED + fresh heartbeat + deadline NOT yet passed -> kept (still serving players)
    #[test]
    fn draining_populated_before_deadline_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:59:30"); // fresh
        let deadline = ts("2026-06-23 12:05:00"); // 5 min out
        let d = reap_decision(&ReapInputs {
            player_count: 5,
            last_update_from_server: Some(last),
            create_date: Some(ts("2026-06-23 10:00:00")),
            stale_secs: 120,
            empty_fresh_secs: 180,
            is_draining: true,
            drain_deadline: Some(deadline),
            ..base(now)
        });
        assert_eq!(d, None);
    }

    // draining + liveness gate OFF (empty_fresh=0) + count 0 -> exempt (no liveness signal to act on)
    #[test]
    fn draining_exempt_when_liveness_gate_off() {
        let now = ts("2026-06-23 12:00:00");
        let empty_since = ts("2026-06-23 11:58:00");
        let d = reap_decision(&ReapInputs {
            last_update_from_server: Some(now),
            last_server_empty_date: Some(empty_since),
            create_date: Some(ts("2026-06-23 10:00:00")),
            is_draining: true,
            ..base(now)
        });
        assert_eq!(d, None);
    }

    // draining + crashed-while-POPULATED (count>0, stale heartbeat) -> STILL reaped via stale_secs
    #[test]
    fn draining_populated_stale_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:56:40"); // 200s ago > stale_secs 120
        let d = reap_decision(&ReapInputs {
            player_count: 5,
            last_update_from_server: Some(last),
            create_date: Some(ts("2026-06-23 10:00:00")),
            stale_secs: 120,
            is_draining: true,
            ..base(now)
        });
        assert_eq!(d, Some(ReapReason::Stale));
    }

    // draining + never-reported + liveness gate ON, still inside boot grace -> KEEP. A server told to
    // drain during boot may not have sent its first heartbeat yet; don't reap it as "lost liveness".
    #[test]
    fn draining_never_reported_within_boot_grace_is_kept() {
        let now = ts("2026-06-23 12:00:00");
        let created = ts("2026-06-23 11:58:00"); // 2 min ago, boot grace 10 min
        let d = reap_decision(&ReapInputs {
            create_date: Some(created),
            empty_fresh_secs: 180,
            is_draining: true,
            ..base(now)
        });
        assert_eq!(d, None);
    }

    // draining + never-reported + liveness gate ON, past boot grace -> reaped (genuinely crashed)
    #[test]
    fn draining_never_reported_past_boot_grace_is_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let created = ts("2026-06-23 11:40:00"); // 20 min ago > boot grace 10 min
        let d = reap_decision(&ReapInputs {
            create_date: Some(created),
            empty_fresh_secs: 180,
            is_draining: true,
            ..base(now)
        });
        assert_eq!(d, Some(ReapReason::Stale));
    }

    // regression: NOT draining + empty-past-timeout (fresh) -> still reaped (guards the new args)
    #[test]
    fn not_draining_empty_still_reaped() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:59:30"); // fresh, so the empty path isn't freshness-gated
        let empty_since = ts("2026-06-23 11:58:00");
        let d = reap_decision(&ReapInputs {
            last_update_from_server: Some(last),
            last_server_empty_date: Some(empty_since),
            create_date: Some(ts("2026-06-23 10:00:00")),
            empty_fresh_secs: 180,
            ..base(now)
        });
        assert_eq!(d, Some(ReapReason::Empty));
    }

    // resolve_misses: a row whose DB lookup returned a name -> teardown target
    #[test]
    fn resolve_misses_named_becomes_target() {
        let resolved = HashMap::from([(1, Some("gs-alpha".to_string()))]);
        let (targets, unresolved) = resolve_misses(vec![(1, ReapReason::Empty)], &resolved);
        assert_eq!(
            targets,
            vec![(1, "gs-alpha".to_string(), ReapReason::Empty)]
        );
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

    // empty + stale heartbeat -> flagged as "retained due to freshness gate".
    #[test]
    fn retained_stale_empty_is_flagged() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:55:00"); // 300s ago > fresh 120
        let empty = ts("2026-06-23 11:50:00");
        assert!(retained_due_to_stale_heartbeat(
            0,
            Some(last),
            Some(empty),
            120,
            now
        ));
    }

    // empty + FRESH heartbeat -> not flagged (it'd be reaped on its own timeline, not freshness-held)
    #[test]
    fn retained_fresh_empty_is_not_flagged() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:59:30"); // 30s ago < fresh 120
        let empty = ts("2026-06-23 11:50:00");
        assert!(!retained_due_to_stale_heartbeat(
            0,
            Some(last),
            Some(empty),
            120,
            now
        ));
    }

    // NULL last_update is the never-reported path, not the freshness gate -> not flagged
    #[test]
    fn retained_never_reported_is_not_flagged() {
        let now = ts("2026-06-23 12:00:00");
        let empty = ts("2026-06-23 11:50:00");
        assert!(!retained_due_to_stale_heartbeat(
            0,
            None,
            Some(empty),
            120,
            now
        ));
    }

    // gate off (empty_fresh_secs = 0) or populated or no empty marker -> not flagged
    #[test]
    fn retained_gate_off_or_populated_or_no_marker_not_flagged() {
        let now = ts("2026-06-23 12:00:00");
        let last = ts("2026-06-23 11:55:00");
        let empty = ts("2026-06-23 11:50:00");
        assert!(!retained_due_to_stale_heartbeat(
            0,
            Some(last),
            Some(empty),
            0,
            now
        )); // gate off
        assert!(!retained_due_to_stale_heartbeat(
            3,
            Some(last),
            Some(empty),
            120,
            now
        )); // populated
        assert!(!retained_due_to_stale_heartbeat(
            0,
            Some(last),
            None,
            120,
            now
        )); // no empty marker
    }
}
