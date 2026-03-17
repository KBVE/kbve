//! Dungeon player persistence — Supabase-backed profile storage.
//!
//! Follows the `MemberCache` pattern: LRU cache + Supabase RPC + graceful
//! degradation (if Supabase is unavailable, games still work in-memory).

use std::num::NonZeroUsize;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tracing::{debug, error, warn};

use kbve::SupabaseClient;

use super::types::{ClassType, GameOverReason, ItemStack, PlayerState, QuestJournal, SessionState};

const SCHEMA: &str = "discordsh";
const CACHE_CAP: usize = 512;
const CACHE_TTL: Duration = Duration::from_secs(300);

// ── Types ───────────────────────────────────────────────────────────────

/// Persistent player profile (mirrors SQL `discordsh.dungeon_profiles`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DungeonProfile {
    pub discord_id: i64,
    pub discord_name: String,
    pub class_id: i16,
    pub level: i16,
    pub xp: i32,
    pub xp_to_next: i32,
    pub gold: i32,
    pub lifetime_kills: i32,
    pub lifetime_gold_earned: i32,
    pub lifetime_rooms_cleared: i32,
    pub lifetime_bosses_defeated: i32,
    pub lifetime_deaths: i32,
    pub lifetime_victories: i32,
    pub lifetime_escapes: i32,
    pub weapon: Option<String>,
    pub armor_gear: Option<String>,
    pub inventory: serde_json::Value,
    pub completed_quests: Vec<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Per-session run summary (inserted into `discordsh.dungeon_runs`).
#[derive(Debug, Clone, Serialize)]
pub struct RunSummary {
    pub outcome: i16,
    pub rooms_cleared: i32,
    pub kills: i32,
    pub gold_earned: i32,
    pub gold_lost: i32,
    pub bosses_defeated: i32,
    pub xp_earned: i32,
    pub level_at_end: i16,
    pub duration_secs: Option<i32>,
}

/// Leaderboard entry returned from `service_leaderboard`.
#[derive(Debug, Clone, Deserialize)]
pub struct LeaderboardEntry {
    pub rank: i64,
    pub discord_id: i64,
    pub discord_name: String,
    pub level: i16,
    pub value: i64,
}

/// JSONB inventory slot shape.
#[derive(Debug, Serialize, Deserialize)]
struct InventorySlot {
    item_id: String,
    qty: u16,
}

struct CachedProfile {
    profile: DungeonProfile,
    fetched_at: Instant,
}

// ── ProfileStore ────────────────────────────────────────────────────────

pub struct ProfileStore {
    client: Option<SupabaseClient>,
    cache: Mutex<lru::LruCache<u64, CachedProfile>>,
    ttl: Duration,
}

impl ProfileStore {
    /// Build from environment. Returns a no-op store if Supabase is unavailable.
    pub fn from_env() -> Self {
        Self {
            client: SupabaseClient::from_env(),
            cache: Mutex::new(lru::LruCache::new(NonZeroUsize::new(CACHE_CAP).unwrap())),
            ttl: CACHE_TTL,
        }
    }

    /// Load a profile, checking cache first then Supabase RPC.
    pub async fn load(&self, discord_id: u64) -> Option<DungeonProfile> {
        // Check cache
        {
            let mut cache = self.cache.lock().await;
            if let Some(entry) = cache.get(&discord_id) {
                if entry.fetched_at.elapsed() < self.ttl {
                    return Some(entry.profile.clone());
                }
            }
        }

        let client = self.client.as_ref()?;
        let params = serde_json::json!({ "p_discord_id": discord_id as i64 });

        match client
            .rpc_schema("service_load_profile", params, SCHEMA)
            .await
        {
            Ok(resp) => {
                if !resp.status().is_success() {
                    warn!(
                        status = %resp.status(),
                        discord_id,
                        "service_load_profile returned non-200"
                    );
                    return None;
                }
                match resp.json::<Vec<DungeonProfile>>().await {
                    Ok(rows) if !rows.is_empty() => {
                        let profile = rows.into_iter().next().unwrap();
                        let mut cache = self.cache.lock().await;
                        cache.put(
                            discord_id,
                            CachedProfile {
                                profile: profile.clone(),
                                fetched_at: Instant::now(),
                            },
                        );
                        Some(profile)
                    }
                    Ok(_) => None,
                    Err(e) => {
                        warn!(error = %e, discord_id, "Failed to parse profile response");
                        None
                    }
                }
            }
            Err(e) => {
                warn!(error = %e, discord_id, "service_load_profile RPC failed");
                None
            }
        }
    }

    /// Save a profile + run summary (fire-and-forget via tokio::spawn).
    pub fn save_async(&self, profile: DungeonProfile, run: RunSummary) {
        let Some(client) = self.client.clone() else {
            return;
        };
        tokio::spawn(async move {
            let params = serde_json::json!({
                "p_discord_id": profile.discord_id,
                "p_discord_name": profile.discord_name,
                "p_class_id": profile.class_id,
                "p_level": profile.level,
                "p_xp": profile.xp,
                "p_xp_to_next": profile.xp_to_next,
                "p_gold": profile.gold,
                "p_lifetime_kills": profile.lifetime_kills,
                "p_lifetime_gold_earned": profile.lifetime_gold_earned,
                "p_lifetime_rooms_cleared": profile.lifetime_rooms_cleared,
                "p_lifetime_bosses_defeated": profile.lifetime_bosses_defeated,
                "p_lifetime_deaths": profile.lifetime_deaths,
                "p_lifetime_victories": profile.lifetime_victories,
                "p_lifetime_escapes": profile.lifetime_escapes,
                "p_weapon": profile.weapon,
                "p_armor_gear": profile.armor_gear,
                "p_inventory": profile.inventory,
                "p_completed_quests": profile.completed_quests,
                "p_run_outcome": run.outcome,
                "p_run_rooms_cleared": run.rooms_cleared,
                "p_run_kills": run.kills,
                "p_run_gold_earned": run.gold_earned,
                "p_run_gold_lost": run.gold_lost,
                "p_run_bosses_defeated": run.bosses_defeated,
                "p_run_xp_earned": run.xp_earned,
                "p_run_level_at_end": run.level_at_end,
                "p_run_duration_secs": run.duration_secs,
            });

            match client
                .rpc_schema("service_upsert_profile", params, SCHEMA)
                .await
            {
                Ok(resp) if resp.status().is_success() => {
                    debug!(discord_id = profile.discord_id, "Profile saved");
                }
                Ok(resp) => {
                    warn!(
                        status = %resp.status(),
                        discord_id = profile.discord_id,
                        "service_upsert_profile returned non-200"
                    );
                }
                Err(e) => {
                    error!(
                        error = %e,
                        discord_id = profile.discord_id,
                        "service_upsert_profile RPC failed"
                    );
                }
            }
        });
    }

    /// Fetch leaderboard (always fresh, no cache).
    pub async fn leaderboard(&self, category: i16, limit: i32) -> Vec<LeaderboardEntry> {
        let Some(client) = self.client.as_ref() else {
            return Vec::new();
        };
        let params = serde_json::json!({
            "p_category": category,
            "p_limit": limit,
        });

        match client
            .rpc_schema("service_leaderboard", params, SCHEMA)
            .await
        {
            Ok(resp) if resp.status().is_success() => resp
                .json::<Vec<LeaderboardEntry>>()
                .await
                .unwrap_or_default(),
            Ok(resp) => {
                warn!(status = %resp.status(), "service_leaderboard returned non-200");
                Vec::new()
            }
            Err(e) => {
                warn!(error = %e, "service_leaderboard RPC failed");
                Vec::new()
            }
        }
    }

    /// Invalidate a cached profile (called after save).
    pub async fn invalidate(&self, discord_id: u64) {
        self.cache.lock().await.pop(&discord_id);
    }
}

// ── Profile ↔ PlayerState conversion ────────────────────────────────────

/// Apply a loaded profile onto a fresh PlayerState and QuestJournal.
pub fn apply_profile_to_player(
    profile: &DungeonProfile,
    player: &mut PlayerState,
    journal: &mut QuestJournal,
) {
    player.class = class_from_id(profile.class_id);
    player.level = profile.level.max(1) as u8;
    player.xp = profile.xp.max(0) as u32;
    player.xp_to_next = profile.xp_to_next.max(1) as u32;
    player.gold = profile.gold.max(0);
    player.lifetime_kills = profile.lifetime_kills.max(0) as u32;
    player.lifetime_gold_earned = profile.lifetime_gold_earned.max(0) as u32;
    player.lifetime_rooms_cleared = profile.lifetime_rooms_cleared.max(0) as u32;
    player.lifetime_bosses_defeated = profile.lifetime_bosses_defeated.max(0) as u32;
    player.weapon = profile.weapon.clone();
    player.armor_gear = profile.armor_gear.clone();

    // Restore inventory from JSONB
    if let Ok(slots) = serde_json::from_value::<Vec<InventorySlot>>(profile.inventory.clone()) {
        for slot in slots {
            player.inventory.push(ItemStack {
                item_id: slot.item_id,
                qty: slot.qty,
            });
        }
    }

    // Restore completed quests
    for ref_slug in &profile.completed_quests {
        if !journal.is_completed(ref_slug) {
            journal.completed.push(ref_slug.clone());
        }
    }
}

/// Extract a save payload from session state at game over.
///
/// Applies death penalty for Defeated/Expired outcomes:
/// - Level/XP: keep level, lose 25% XP (no de-level)
/// - Gold: lose 50% of run-earned gold
/// - Inventory: lose consumables gained this run (diff against snapshot)
/// - Gear: always kept
/// - Lifetime stats: always increment
pub fn extract_save_payload(
    discord_id: u64,
    discord_name: &str,
    player: &PlayerState,
    journal: &QuestJournal,
    reason: &GameOverReason,
    snapshot: Option<&DungeonProfile>,
    session: &SessionState,
) -> (DungeonProfile, RunSummary) {
    let is_penalty = matches!(reason, GameOverReason::Defeated | GameOverReason::Expired);

    // Base lifetime stats from snapshot (or zero for new players)
    let base_kills = snapshot.map_or(0, |s| s.lifetime_kills);
    let base_gold_earned = snapshot.map_or(0, |s| s.lifetime_gold_earned);
    let base_rooms = snapshot.map_or(0, |s| s.lifetime_rooms_cleared);
    let base_bosses = snapshot.map_or(0, |s| s.lifetime_bosses_defeated);
    let base_deaths = snapshot.map_or(0, |s| s.lifetime_deaths);
    let base_victories = snapshot.map_or(0, |s| s.lifetime_victories);
    let base_escapes = snapshot.map_or(0, |s| s.lifetime_escapes);

    // Run-level deltas
    let run_kills = (player.lifetime_kills as i32).saturating_sub(base_kills);
    let run_gold = (player.lifetime_gold_earned as i32).saturating_sub(base_gold_earned);
    let run_rooms = (player.lifetime_rooms_cleared as i32).saturating_sub(base_rooms);
    let run_bosses = (player.lifetime_bosses_defeated as i32).saturating_sub(base_bosses);
    let run_xp = player.xp as i32 - snapshot.map_or(0, |s| s.xp);

    // Gold penalty: lose 50% of run-earned gold on defeat
    let gold_lost = if is_penalty { run_gold / 2 } else { 0 };
    let final_gold = if is_penalty {
        (player.gold - gold_lost).max(0)
    } else {
        player.gold
    };

    // XP penalty: lose 25% of current XP on defeat (no de-level)
    let final_xp = if is_penalty {
        let penalty = player.xp / 4;
        player.xp.saturating_sub(penalty)
    } else {
        player.xp
    };

    // Inventory: on defeat, revert to snapshot inventory (lose this run's gains)
    let final_inventory = if is_penalty {
        snapshot
            .map(|s| s.inventory.clone())
            .unwrap_or_else(|| serde_json::json!([]))
    } else {
        inventory_to_json(&player.inventory)
    };

    // Lifetime stats always increment
    let lifetime_kills = base_kills + run_kills.max(0);
    let lifetime_gold_earned = base_gold_earned + run_gold.max(0);
    let lifetime_rooms = base_rooms + run_rooms.max(0);
    let lifetime_bosses = base_bosses + run_bosses.max(0);

    let (lifetime_deaths, lifetime_victories, lifetime_escapes) = match reason {
        GameOverReason::Defeated | GameOverReason::Expired => {
            (base_deaths + 1, base_victories, base_escapes)
        }
        GameOverReason::Victory => (base_deaths, base_victories + 1, base_escapes),
        GameOverReason::Escaped => (base_deaths, base_victories, base_escapes + 1),
    };

    // Duration
    let duration_secs = session.created_at.elapsed().as_secs() as i32;

    let profile = DungeonProfile {
        discord_id: discord_id as i64,
        discord_name: discord_name.to_owned(),
        class_id: class_to_id(&player.class),
        level: player.level as i16,
        xp: final_xp as i32,
        xp_to_next: player.xp_to_next as i32,
        gold: final_gold,
        lifetime_kills,
        lifetime_gold_earned,
        lifetime_rooms_cleared: lifetime_rooms,
        lifetime_bosses_defeated: lifetime_bosses,
        lifetime_deaths,
        lifetime_victories,
        lifetime_escapes,
        weapon: player.weapon.clone(),
        armor_gear: player.armor_gear.clone(),
        inventory: final_inventory,
        completed_quests: journal.completed.clone(),
        created_at: None,
        updated_at: None,
    };

    let run = RunSummary {
        outcome: reason_to_outcome(reason),
        rooms_cleared: run_rooms.max(0),
        kills: run_kills.max(0),
        gold_earned: run_gold.max(0),
        gold_lost,
        bosses_defeated: run_bosses.max(0),
        xp_earned: run_xp.max(0),
        level_at_end: player.level as i16,
        duration_secs: Some(duration_secs),
    };

    (profile, run)
}

/// Save all players in a session (called on game-over, end, leave, expire).
pub fn save_all_players(
    profiles: &std::sync::Arc<ProfileStore>,
    session: &SessionState,
    reason: &GameOverReason,
) {
    for (&uid, player) in &session.players {
        let snapshot = player.saved_snapshot.as_ref();
        let (profile, run) = extract_save_payload(
            uid.get(),
            &player.name,
            player,
            &session.quest_journal,
            reason,
            snapshot,
            session,
        );
        profiles.save_async(profile, run);
    }

    // Invalidate cache for all players
    let profiles = profiles.clone();
    let uids: Vec<u64> = session.players.keys().map(|uid| uid.get()).collect();
    tokio::spawn(async move {
        for uid in uids {
            profiles.invalidate(uid).await;
        }
    });
}

// ── Helpers ─────────────────────────────────────────────────────────────

fn class_from_id(id: i16) -> ClassType {
    match id {
        2 => ClassType::Rogue,
        3 => ClassType::Cleric,
        _ => ClassType::Warrior,
    }
}

fn class_to_id(class: &ClassType) -> i16 {
    match class {
        ClassType::Warrior => 1,
        ClassType::Rogue => 2,
        ClassType::Cleric => 3,
    }
}

fn reason_to_outcome(reason: &GameOverReason) -> i16 {
    match reason {
        GameOverReason::Victory => 1,
        GameOverReason::Defeated => 2,
        GameOverReason::Escaped => 3,
        GameOverReason::Expired => 4,
    }
}

fn inventory_to_json(inv: &[ItemStack]) -> serde_json::Value {
    let slots: Vec<InventorySlot> = inv
        .iter()
        .map(|s| InventorySlot {
            item_id: s.item_id.clone(),
            qty: s.qty,
        })
        .collect();
    serde_json::to_value(slots).unwrap_or_else(|_| serde_json::json!([]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn class_round_trip() {
        assert_eq!(
            class_from_id(class_to_id(&ClassType::Warrior)),
            ClassType::Warrior
        );
        assert_eq!(
            class_from_id(class_to_id(&ClassType::Rogue)),
            ClassType::Rogue
        );
        assert_eq!(
            class_from_id(class_to_id(&ClassType::Cleric)),
            ClassType::Cleric
        );
        assert_eq!(class_from_id(0), ClassType::Warrior); // default
    }

    #[test]
    fn reason_round_trip() {
        assert_eq!(reason_to_outcome(&GameOverReason::Victory), 1);
        assert_eq!(reason_to_outcome(&GameOverReason::Defeated), 2);
        assert_eq!(reason_to_outcome(&GameOverReason::Escaped), 3);
        assert_eq!(reason_to_outcome(&GameOverReason::Expired), 4);
    }

    #[test]
    fn inventory_json_round_trip() {
        let inv = vec![
            ItemStack {
                item_id: "potion_hp".to_owned(),
                qty: 3,
            },
            ItemStack {
                item_id: "gold_coin".to_owned(),
                qty: 10,
            },
        ];
        let json = inventory_to_json(&inv);
        let slots: Vec<InventorySlot> = serde_json::from_value(json).unwrap();
        assert_eq!(slots.len(), 2);
        assert_eq!(slots[0].item_id, "potion_hp");
        assert_eq!(slots[0].qty, 3);
    }

    #[test]
    fn death_penalty_gold() {
        // Simulate: snapshot had 100 gold, player earned 200 more (now 300)
        // On defeat: lose 50% of run-earned (100), keep 200
        let snapshot = DungeonProfile {
            discord_id: 1,
            discord_name: "Test".to_owned(),
            class_id: 1,
            level: 1,
            xp: 0,
            xp_to_next: 100,
            gold: 100,
            lifetime_kills: 0,
            lifetime_gold_earned: 100,
            lifetime_rooms_cleared: 0,
            lifetime_bosses_defeated: 0,
            lifetime_deaths: 0,
            lifetime_victories: 0,
            lifetime_escapes: 0,
            weapon: None,
            armor_gear: None,
            inventory: serde_json::json!([]),
            completed_quests: Vec::new(),
            created_at: None,
            updated_at: None,
        };

        let player = PlayerState {
            gold: 300,
            lifetime_gold_earned: 300,
            ..PlayerState::default()
        };

        let journal = QuestJournal::default();

        // Build a minimal session for duration
        let session = make_test_session();

        let (profile, run) = extract_save_payload(
            1,
            "Test",
            &player,
            &journal,
            &GameOverReason::Defeated,
            Some(&snapshot),
            &session,
        );

        assert_eq!(run.gold_earned, 200);
        assert_eq!(run.gold_lost, 100);
        assert_eq!(profile.gold, 200); // 300 - 100 penalty
        assert_eq!(profile.lifetime_deaths, 1);
        assert_eq!(profile.lifetime_gold_earned, 300);
    }

    #[test]
    fn victory_no_penalty() {
        let snapshot = DungeonProfile {
            discord_id: 1,
            discord_name: "Test".to_owned(),
            class_id: 1,
            level: 1,
            xp: 0,
            xp_to_next: 100,
            gold: 0,
            lifetime_kills: 0,
            lifetime_gold_earned: 0,
            lifetime_rooms_cleared: 0,
            lifetime_bosses_defeated: 0,
            lifetime_deaths: 0,
            lifetime_victories: 0,
            lifetime_escapes: 0,
            weapon: None,
            armor_gear: None,
            inventory: serde_json::json!([]),
            completed_quests: Vec::new(),
            created_at: None,
            updated_at: None,
        };

        let player = PlayerState {
            gold: 500,
            xp: 200,
            lifetime_gold_earned: 500,
            ..PlayerState::default()
        };

        let journal = QuestJournal::default();
        let session = make_test_session();

        let (profile, run) = extract_save_payload(
            1,
            "Test",
            &player,
            &journal,
            &GameOverReason::Victory,
            Some(&snapshot),
            &session,
        );

        assert_eq!(profile.gold, 500); // no penalty
        assert_eq!(profile.xp, 200); // no penalty
        assert_eq!(run.gold_lost, 0);
        assert_eq!(profile.lifetime_victories, 1);
        assert_eq!(profile.lifetime_deaths, 0);
    }

    fn make_test_session() -> SessionState {
        use crate::discord::game::{content, types::*};
        use poise::serenity_prelude as serenity;

        let owner = serenity::UserId::new(1);
        let mut player = PlayerState::default();
        player.inventory = content::starting_inventory();

        SessionState {
            id: uuid::Uuid::new_v4(),
            short_id: "test1234".to_owned(),
            owner,
            party: Vec::new(),
            mode: SessionMode::Solo,
            phase: GamePhase::Exploring,
            channel_id: serenity::ChannelId::new(1),
            message_id: serenity::MessageId::new(1),
            created_at: std::time::Instant::now(),
            last_action_at: std::time::Instant::now(),
            turn: 0,
            players: std::collections::HashMap::from([(owner, player)]),
            enemies: Vec::new(),
            room: content::generate_room(0),
            log: Vec::new(),
            show_items: false,
            pending_actions: std::collections::HashMap::new(),
            map: test_map_default(),
            show_map: false,
            show_inventory: false,
            pending_destination: None,
            enemies_had_first_strike: false,
            quest_journal: QuestJournal::default(),
        }
    }
}
