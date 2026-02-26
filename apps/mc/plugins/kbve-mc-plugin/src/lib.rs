#![allow(unused_imports, clippy::async_yields_async)]

#[macro_use]
mod macros;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};

use dashmap::DashMap;
use pumpkin::command::args::players::PlayersArgumentConsumer;
use pumpkin::command::args::{ConsumedArgs, FindArgDefaultName};
use pumpkin::command::dispatcher::CommandError;
use pumpkin::command::tree::CommandTree;
use pumpkin::command::tree::builder::{argument_default_name, literal};
use pumpkin::command::{CommandExecutor, CommandResult, CommandSender};
use pumpkin::entity::EntityBase;
use pumpkin::plugin::api::Context;
use pumpkin::plugin::player::player_death::PlayerDeathEvent;
use pumpkin::plugin::player::player_interact_entity_event::PlayerInteractEntityEvent;
use pumpkin::plugin::player::player_interact_event::PlayerInteractEvent;
use pumpkin::plugin::player::player_join::PlayerJoinEvent;
use pumpkin::plugin::player::player_respawn::PlayerRespawnEvent;
use pumpkin::plugin::{BoxFuture, EventHandler, EventPriority};
use pumpkin::server::Server;
use pumpkin_api_macros::plugin_impl;
use pumpkin_data::damage::DamageType;
use pumpkin_data::data_component::DataComponent;
use pumpkin_data::data_component_impl::{
    CustomNameImpl, DamageImpl, DataComponentImpl, ItemModelImpl, MaxDamageImpl,
    PotionContentsImpl, StatusEffectInstance,
};
use pumpkin_data::item::Item;
use pumpkin_data::particle::Particle;
use pumpkin_protocol::java::server::play::ActionType;
use pumpkin_util::Hand;
use pumpkin_util::math::position::BlockPos;
use pumpkin_util::math::vector2::Vector2;
use pumpkin_util::math::vector3::Vector3;
use pumpkin_util::permission::{Permission, PermissionDefault};
use pumpkin_util::text::TextComponent;
use pumpkin_util::text::color::NamedColor;
use pumpkin_world::item::ItemStack;
use std::thread;

// ---------------------------------------------------------------------------
// Debug tracing infrastructure
// ---------------------------------------------------------------------------
// Controlled by KBVE_TRACE env var at startup.
// Levels: INFO (always on), DEBUG (KBVE_TRACE=1), TRACE (KBVE_TRACE=2)
//
// Usage:
//   info!("message");           — always printed
//   debug!("message");          — printed when KBVE_TRACE >= 1
//   trace!("message");          — printed when KBVE_TRACE >= 2

static TRACE_LEVEL: LazyLock<u8> = LazyLock::new(|| {
    std::env::var("KBVE_TRACE")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
});

macro_rules! info {
    ($($arg:tt)*) => {
        eprintln!("[kbve-mc-plugin][INFO] {}", format!($($arg)*))
    };
}

macro_rules! debug {
    ($($arg:tt)*) => {
        if *TRACE_LEVEL >= 1 {
            eprintln!("[kbve-mc-plugin][DEBUG] {}", format!($($arg)*))
        }
    };
}

macro_rules! trace {
    ($($arg:tt)*) => {
        if *TRACE_LEVEL >= 2 {
            eprintln!("[kbve-mc-plugin][TRACE] {}", format!($($arg)*))
        }
    };
}

/// Measure wall-clock duration of an async block. Returns (result, Duration).
macro_rules! timed {
    ($label:expr, $block:expr) => {{
        let _t0 = Instant::now();
        let _result = $block;
        let _elapsed = _t0.elapsed();
        debug!("{} took {:.1?}", $label, _elapsed);
        (_result, _elapsed)
    }};
}

// ---------------------------------------------------------------------------
// Per-player cooldowns (keyed by UUID bits, value = epoch millis of last fire)
// ---------------------------------------------------------------------------

static ORBITAL_COOLDOWNS: LazyLock<DashMap<u128, Instant>> = LazyLock::new(DashMap::new);
const ORBITAL_COOLDOWN: Duration = Duration::from_millis(2000);

// ---------------------------------------------------------------------------
// Welcome handler (fires on player join)
// ---------------------------------------------------------------------------

struct WelcomeHandler;

impl EventHandler<PlayerJoinEvent> for WelcomeHandler {
    fn handle<'a>(
        &'a self,
        server: &'a Arc<Server>,
        event: &'a PlayerJoinEvent,
    ) -> BoxFuture<'a, ()> {
        let player = Arc::clone(&event.player);
        let server = Arc::clone(server);
        Box::pin(async move {
            let name = &player.gameprofile.name;
            let uuid = player.gameprofile.id;
            let handler_start = Instant::now();

            info!("Sending welcome to {name} ({uuid})");

            // Capture BEFORE the sleep — spawn_java_player runs concurrently and
            // sets has_played_before = true at world/mod.rs:1881 during the delay.
            let is_first_join = !player.has_played_before.load(Ordering::Relaxed);
            info!("is_first_join={is_first_join} for {name}");

            // Brief delay so the client finishes the login sequence before we send messages.
            // Use std::thread::sleep because the cdylib plugin has its own tokio statics
            // and cannot access the host runtime's timer driver.
            debug!("Sleeping 2s for login sequence to complete...");
            thread::sleep(Duration::from_secs(2));

            let welcome = TextComponent::text(format!("Welcome to KBVE, {name}!"))
                .color_named(NamedColor::Gold)
                .bold();

            let uuid_msg = TextComponent::text(format!("Your UUID: {uuid}"))
                .color_named(NamedColor::Gray)
                .italic();

            timed!("send_welcome_messages", {
                player.send_system_message(&welcome).await;
                player.send_system_message(&uuid_msg).await;
            });

            // Only auto-give on first join to avoid the cdylib TypeId mismatch panic
            // in DataComponentImpl::equal() when Pumpkin tries to stack-compare
            // plugin-created items with existing inventory items on reconnect.
            if is_first_join {
                debug!("First join — auto-giving custom items to {name}");

                // Skip potion items — Pumpkin's entity metadata sync for PotionContents
                // crashes the vanilla client (set_entity_data index 18 OOB).
                let stacks: Vec<ItemStack> = ITEM_REGISTRY
                    .iter()
                    .filter(|entry| {
                        let dominated = entry.value().potion.is_some();
                        if dominated {
                            trace!("Skipping potion item '{}' for auto-give", entry.key());
                        }
                        !dominated
                    })
                    .filter_map(|entry| {
                        let key = *entry.key();
                        let result = build_item_stack(entry.value());
                        trace!(
                            "build_item_stack('{}') = {}",
                            key,
                            if result.is_some() { "ok" } else { "FAILED" }
                        );
                        result
                    })
                    .collect();

                let given = stacks.len();
                debug!("Built {given} item stacks for {name}, inserting into inventory...");

                for (i, mut stack) in stacks.into_iter().enumerate() {
                    trace!("Inserting item {}/{given} into inventory...", i + 1);
                    let (_, dur) = timed!(&format!("insert_item_{}", i + 1), {
                        player.inventory().insert_stack_anywhere(&mut stack).await;
                    });
                    if !stack.is_empty() {
                        debug!(
                            "Item {}/{given} didn't fit in inventory, dropping on ground",
                            i + 1
                        );
                        player.drop_item(stack).await;
                    }
                    let _ = dur; // suppress unused warning when debug is off
                }
                info!("Auto-gave {given} custom items to {name}");
            } else {
                info!("Returning player {name} — skipping auto-give (cdylib TypeId workaround)");
            }

            // For first-time players, ensure they spawn on solid ground (not ocean).
            // Pumpkin defaults world spawn to (0, y, 0) which is often ocean.
            if is_first_join {
                let world = player.world();
                let info_data = server.level_info.load();
                let spawn_x = info_data.spawn_x;
                let spawn_z = info_data.spawn_z;

                debug!("Checking spawn surface at ({spawn_x}, ?, {spawn_z})...");

                let (top_y, _) = timed!("get_top_block(spawn)", {
                    world.get_top_block(Vector2::new(spawn_x, spawn_z)).await
                });
                let (surface_block, _) = timed!("get_block(spawn_surface)", {
                    world
                        .get_block(&BlockPos::new(spawn_x, top_y, spawn_z))
                        .await
                });

                info!(
                    "Spawn surface check at ({}, {}, {}): solid={}",
                    spawn_x,
                    top_y,
                    spawn_z,
                    surface_block.is_solid(),
                );

                if !surface_block.is_solid() {
                    info!("{name} spawned on non-solid ground, searching for land...");
                    let search_start = Instant::now();
                    let mut checked = 0u32;

                    // Search in expanding rings (chunk-sized steps) for solid ground
                    'search: for radius in 1..=20u32 {
                        let step = (radius * 16) as i32;
                        let offsets: [(i32, i32); 8] = [
                            (step, 0),
                            (-step, 0),
                            (0, step),
                            (0, -step),
                            (step, step),
                            (-step, step),
                            (step, -step),
                            (-step, -step),
                        ];

                        for (dx, dz) in offsets {
                            checked += 1;
                            let check_x = spawn_x + dx;
                            let check_z = spawn_z + dz;

                            trace!(
                                "Land search ring={radius} checking ({check_x}, ?, {check_z})..."
                            );

                            let check_top =
                                world.get_top_block(Vector2::new(check_x, check_z)).await;
                            let check_block = world
                                .get_block(&BlockPos::new(check_x, check_top, check_z))
                                .await;

                            if check_block.is_solid() {
                                let land_pos = Vector3::new(
                                    f64::from(check_x) + 0.5,
                                    f64::from(check_top + 1),
                                    f64::from(check_z) + 0.5,
                                );

                                info!(
                                    "Found land at ({}, {}, {}) after {checked} checks in {:.1?} — teleporting {name}",
                                    check_x,
                                    check_top + 1,
                                    check_z,
                                    search_start.elapsed(),
                                );

                                player.request_teleport(land_pos, 0.0, 0.0).await;

                                // Update world spawn so future players land here too
                                let current_info = server.level_info.load();
                                let mut new_info = (**current_info).clone();
                                new_info.spawn_x = check_x;
                                new_info.spawn_y = check_top + 1;
                                new_info.spawn_z = check_z;
                                server.level_info.store(Arc::new(new_info));

                                info!(
                                    "World spawn updated to ({}, {}, {})",
                                    check_x,
                                    check_top + 1,
                                    check_z,
                                );

                                player
                                    .send_system_message(
                                        &TextComponent::text("Teleported to land!")
                                            .color_named(NamedColor::Green),
                                    )
                                    .await;

                                break 'search;
                            }
                        }

                        debug!(
                            "Land search ring {radius}/20 complete ({checked} total checks, {:.1?} elapsed)",
                            search_start.elapsed()
                        );
                    }
                }
            }

            info!(
                "WelcomeHandler for {name} completed in {:.1?}",
                handler_start.elapsed()
            );
        })
    }
}

// ---------------------------------------------------------------------------
// Item helpers
// ---------------------------------------------------------------------------

/// Build an `ItemStack` from an `ItemDef`. Returns `None` if the base item
/// key is not in the vanilla registry.
fn build_item_stack(def: &ItemDef) -> Option<ItemStack> {
    let item = Item::from_registry_key(def.base_item_key)?;
    let mut stack = ItemStack::new(1, item);

    stack.patch.push((
        DataComponent::ItemModel,
        Some(
            ItemModelImpl {
                model: def.model.to_string(),
            }
            .to_dyn(),
        ),
    ));
    stack.patch.push((
        DataComponent::CustomName,
        Some(
            CustomNameImpl {
                name: def.display_name.to_string(),
            }
            .to_dyn(),
        ),
    ));

    if let Some(max_dmg) = def.max_damage {
        stack.patch.push((
            DataComponent::MaxDamage,
            Some(
                MaxDamageImpl {
                    max_damage: max_dmg,
                }
                .to_dyn(),
            ),
        ));
        stack.patch.push((
            DataComponent::Damage,
            Some(DamageImpl { damage: 0 }.to_dyn()),
        ));
    }

    if let Some(potion) = &def.potion {
        stack.patch.push((
            DataComponent::PotionContents,
            Some(
                PotionContentsImpl {
                    potion_id: None,
                    custom_color: Some(potion.custom_color),
                    custom_effects: potion
                        .effects
                        .iter()
                        .map(|&(effect_id, amplifier, duration)| StatusEffectInstance {
                            effect_id,
                            amplifier,
                            duration,
                            ambient: false,
                            show_particles: true,
                            show_icon: true,
                        })
                        .collect(),
                    custom_name: Some(def.display_name.to_string()),
                }
                .to_dyn(),
            ),
        ));
    }

    Some(stack)
}

// ---------------------------------------------------------------------------
// Item registry — DashMap keyed by command name
// ---------------------------------------------------------------------------

struct PotionEffects {
    custom_color: i32,
    effects: &'static [(i32, i32, i32)], // (effect_id, amplifier, duration_ticks)
}

struct ItemDef {
    base_item_key: &'static str,
    model: &'static str,
    display_name: &'static str,
    message_color: NamedColor,
    particle: Option<(Particle, i32)>,
    max_damage: Option<i32>,
    potion: Option<PotionEffects>,
}

static ITEM_REGISTRY: LazyLock<DashMap<&'static str, ItemDef>> = LazyLock::new(|| {
    let map = DashMap::new();

    item_registry!(map;
        // ── Basic items ─────────────────────────────────────────────────
        "coin" => {
            base: "gold_nugget", model: "kbve:kbve_coin",
            name: "KBVE Coin", color: NamedColor::Gold,
        },
        "sword" => {
            base: "diamond_sword", model: "kbve:kbve_sword",
            name: "KBVE Sword", color: NamedColor::Aqua,
        },
        "rust_stone" => {
            base: "stone", model: "kbve:rust_stone",
            name: "Rust Stone", color: NamedColor::Red,
            particle: (Particle::Flame, 15),
        },
        "scythe" => {
            base: "iron_hoe", model: "kbve:kbve_scythe",
            name: "KBVE Scythe", color: NamedColor::DarkGray,
            particle: (Particle::Smoke, 8),
        },
        "spartan_shield" => {
            base: "shield", model: "kbve:spartan_shield",
            name: "Spartan Shield", color: NamedColor::DarkRed,
            particle: (Particle::Flame, 10),
            max_damage: 200, // vanilla shield = 336; mid-tier
        },

        // ── Combat potions ──────────────────────────────────────────────
        // Effect IDs from pumpkin_data::effect::StatusEffect

        // Instant Health II + Regeneration I (10s)
        "evelyn_potion" => {
            base: "potion", model: "kbve:evelyn_potion",
            name: "Master Evelyn Healing Potion", color: NamedColor::LightPurple,
            particle: (Particle::Effect, 12),
            potion: { color: 0xFF55FF, effects: &[
                (5, 1, 1),   // Instant Health II
                (9, 0, 200), // Regeneration I (10s)
            ]},
        },
        // Strength I (8s) + Speed I (8s) + Nausea (3s)
        "berserker_brew" => {
            base: "potion", model: "kbve:berserker_brew",
            name: "Berserker's Brew", color: NamedColor::Red,
            particle: (Particle::Flame, 10),
            potion: { color: 0xCC3300, effects: &[
                (4, 0, 160), // Strength I (8s)
                (0, 0, 160), // Speed I (8s)
                (8, 0, 60),  // Nausea (3s)
            ]},
        },
        // Invisibility (15s) + Speed I (10s)
        "shadow_veil_elixir" => {
            base: "potion", model: "kbve:shadow_veil_elixir",
            name: "Shadow Veil Elixir", color: NamedColor::DarkPurple,
            particle: (Particle::Smoke, 8),
            potion: { color: 0x330066, effects: &[
                (13, 0, 300), // Invisibility (15s)
                (0, 0, 200),  // Speed I (10s)
            ]},
        },
        // Resistance I (12s) + Slowness I (12s)
        "iron_skin_tonic" => {
            base: "potion", model: "kbve:iron_skin_tonic",
            name: "Iron Skin Tonic", color: NamedColor::Gray,
            particle: (Particle::Crit, 6),
            potion: { color: 0xA0A0B0, effects: &[
                (10, 0, 240), // Resistance I (12s)
                (1, 0, 240),  // Slowness I (12s)
            ]},
        },
        // Fire Resistance (30s) + Regeneration I (10s)
        "phoenix_tears" => {
            base: "potion", model: "kbve:phoenix_tears",
            name: "Phoenix Tears", color: NamedColor::Gold,
            particle: (Particle::Lava, 8),
            potion: { color: 0xFF9900, effects: &[
                (11, 0, 600), // Fire Resistance (30s)
                (9, 0, 200),  // Regeneration I (10s)
            ]},
        },
        // Health Boost I (20s) + Strength I (8s)
        "titan_draft" => {
            base: "potion", model: "kbve:titan_draft",
            name: "Titan's Draft", color: NamedColor::DarkRed,
            particle: (Particle::HappyVillager, 10),
            potion: { color: 0x8B0000, effects: &[
                (20, 0, 400), // Health Boost I (20s)
                (4, 0, 160),  // Strength I (8s)
            ]},
        },
        // Speed II (6s) + Jump Boost I (10s)
        "windwalker_serum" => {
            base: "potion", model: "kbve:windwalker_serum",
            name: "Windwalker Serum", color: NamedColor::Aqua,
            particle: (Particle::Cloud, 8),
            potion: { color: 0x66CCFF, effects: &[
                (0, 1, 120), // Speed II (6s)
                (7, 0, 200), // Jump Boost I (10s)
            ]},
        },
        // Night Vision (45s) + Absorption I (15s)
        "nightshade_extract" => {
            base: "potion", model: "kbve:nightshade_extract",
            name: "Nightshade Extract", color: NamedColor::DarkBlue,
            particle: (Particle::Witch, 6),
            potion: { color: 0x1A0033, effects: &[
                (15, 0, 900), // Night Vision (45s)
                (21, 0, 300), // Absorption I (15s)
            ]},
        },
        // Resistance I (8s) + Absorption II (8s)
        "stoneguard_elixir" => {
            base: "potion", model: "kbve:stoneguard_elixir",
            name: "Stoneguard Elixir", color: NamedColor::DarkGray,
            particle: (Particle::Crit, 8),
            potion: { color: 0x8B6914, effects: &[
                (10, 0, 160), // Resistance I (8s)
                (21, 1, 160), // Absorption II (8s)
            ]},
        },
        // Strength II (4s) + Instant Health I + Hunger I (10s)
        "bloodlust_potion" => {
            base: "potion", model: "kbve:bloodlust_potion",
            name: "Bloodlust Potion", color: NamedColor::DarkRed,
            particle: (Particle::DragonBreath, 8),
            potion: { color: 0xAA0000, effects: &[
                (4, 1, 80),   // Strength II (4s)
                (5, 0, 1),    // Instant Health I
                (16, 0, 200), // Hunger I (10s)
            ]},
        },
        // Slow Falling (15s) + Speed I (10s) + Glowing (10s)
        "voidstep_tincture" => {
            base: "potion", model: "kbve:voidstep_tincture",
            name: "Voidstep Tincture", color: NamedColor::DarkAqua,
            particle: (Particle::EndRod, 8),
            potion: { color: 0x005566, effects: &[
                (27, 0, 300), // Slow Falling (15s)
                (0, 0, 200),  // Speed I (10s)
                (23, 0, 200), // Glowing (10s)
            ]},
        },

        // ── Orbital Strike weapons ──────────────────────────────────────

        // 10 uses before breaking
        "orbital_cannon_a" => {
            base: "blaze_rod", model: "kbve:orbital_cannon_a",
            name: "Orbital Strike Cannon (Vanguard)", color: NamedColor::Aqua,
            particle: (Particle::SonicBoom, 5),
            max_damage: 10,
        },
        "orbital_cannon_b" => {
            base: "blaze_rod", model: "kbve:orbital_cannon_b",
            name: "Orbital Strike Cannon (Inferno)", color: NamedColor::Red,
            particle: (Particle::SonicBoom, 5),
            max_damage: 10,
        },
        // Full thrown-on-impact behavior requires Pumpkin-side ProjectileHitEvent
        "orbital_strike_potion_a" => {
            base: "splash_potion", model: "kbve:orbital_strike_potion_a",
            name: "Orbital Strike Potion (Arcane)", color: NamedColor::Aqua,
            particle: (Particle::ExplosionEmitter, 3),
            potion: { color: 0x00CCFF, effects: &[
                (4, 2, 100),  // Strength III (5s)
                (23, 0, 200), // Glowing (10s)
            ]},
        },
        "orbital_strike_potion_b" => {
            base: "splash_potion", model: "kbve:orbital_strike_potion_b",
            name: "Orbital Strike Potion (Inferno)", color: NamedColor::DarkRed,
            particle: (Particle::ExplosionEmitter, 3),
            potion: { color: 0xFF2200, effects: &[
                (4, 2, 100),  // Strength III (5s)
                (23, 0, 200), // Glowing (10s)
            ]},
        },
    );

    map
});

// ---------------------------------------------------------------------------
// /kbve give <item> <player> — generic executor backed by ITEM_REGISTRY
// ---------------------------------------------------------------------------

struct GiveItemExecutor {
    item_key: &'static str,
}

impl CommandExecutor for GiveItemExecutor {
    fn execute<'a>(
        &'a self,
        sender: &'a CommandSender,
        _server: &'a Server,
        args: &'a ConsumedArgs<'a>,
    ) -> CommandResult<'a> {
        Box::pin(async move {
            let def = ITEM_REGISTRY
                .get(self.item_key)
                .ok_or_else(|| CommandError::CommandFailed(TextComponent::text("Unknown item")))?;

            let targets = PlayersArgumentConsumer.find_arg_default_name(args)?;
            debug!(
                "/kbve give {} to {} target(s)",
                self.item_key,
                targets.len()
            );

            for target in targets {
                let target_name = &target.gameprofile.name;
                let mut stack = build_item_stack(&def).ok_or_else(|| {
                    CommandError::CommandFailed(TextComponent::text(format!(
                        "{} not found",
                        def.base_item_key
                    )))
                })?;

                debug!("Giving '{}' to {target_name}", self.item_key);
                target.inventory().insert_stack_anywhere(&mut stack).await;
                if !stack.is_empty() {
                    debug!("Inventory full for {target_name}, dropping item");
                    target.drop_item(stack).await;
                }

                if let Some((particle, count)) = &def.particle {
                    let pos = target.living_entity.entity.pos.load();
                    trace!(
                        "Spawning {count} particles at ({:.1}, {:.1}, {:.1})",
                        pos.x,
                        pos.y + 1.0,
                        pos.z
                    );
                    target
                        .world()
                        .spawn_particle(
                            Vector3::new(pos.x, pos.y + 1.0, pos.z),
                            Vector3::new(0.3, 0.5, 0.3),
                            0.05,
                            *count,
                            *particle,
                        )
                        .await;
                }
            }

            sender
                .send_message(
                    TextComponent::text(format!("Gave {}!", def.display_name))
                        .color_named(def.message_color),
                )
                .await;
            Ok(1)
        })
    }
}

fn kbve_command_tree() -> CommandTree {
    let mut give = literal("give");
    for entry in ITEM_REGISTRY.iter() {
        let key = *entry.key();
        give = give.then(
            literal(key).then(
                argument_default_name(PlayersArgumentConsumer)
                    .execute(GiveItemExecutor { item_key: key }),
            ),
        );
    }
    CommandTree::new(["kbve"], "KBVE custom items").then(give)
}

// ---------------------------------------------------------------------------
// Shield block handler — reflects damage when attacker hits a shield holder
// ---------------------------------------------------------------------------

struct ShieldBlockHandler;

impl EventHandler<PlayerInteractEntityEvent> for ShieldBlockHandler {
    fn handle<'a>(
        &'a self,
        _server: &'a Arc<Server>,
        event: &'a PlayerInteractEntityEvent,
    ) -> BoxFuture<'a, ()> {
        let attacker = Arc::clone(&event.player);
        let target = Arc::clone(&event.target);
        let action = event.action.clone();

        Box::pin(async move {
            if !matches!(action, ActionType::Attack) {
                return;
            }

            let Some(target_player) = target.get_player() else {
                return;
            };

            let attacker_name = &attacker.gameprofile.name;
            let target_name = &target_player.gameprofile.name;
            trace!("{attacker_name} attacked {target_name}, checking for shield...");

            // Check both hands for the Spartan Shield
            let has_shield = {
                let off_hand = target_player
                    .inventory()
                    .get_stack_in_hand(Hand::Left)
                    .await;
                let stack = off_hand.lock().await;
                let off = stack
                    .get_data_component::<ItemModelImpl>()
                    .is_some_and(|m| m.model == "kbve:spartan_shield");

                if off {
                    true
                } else {
                    let main_hand = target_player.inventory().held_item();
                    let stack = main_hand.lock().await;
                    stack
                        .get_data_component::<ItemModelImpl>()
                        .is_some_and(|m| m.model == "kbve:spartan_shield")
                }
            };

            if !has_shield {
                trace!("{target_name} has no shield — no reflection");
                return;
            }

            debug!("Shield block! {target_name} reflects 3 thorns damage to {attacker_name}");

            // Deal 3 thorns damage back to the attacker
            attacker
                .damage_with_context(
                    &*attacker,
                    3.0,
                    DamageType::THORNS,
                    None,
                    Some(target_player),
                    None,
                )
                .await;

            // Degrade the shield (1 durability per reflected hit)
            target_player.damage_held_item(1).await;

            // Visual feedback — flame burst on the attacker
            let pos = attacker.living_entity.entity.pos.load();
            attacker
                .world()
                .spawn_particle(
                    Vector3::new(pos.x, pos.y + 1.0, pos.z),
                    Vector3::new(0.2, 0.3, 0.2),
                    0.02,
                    8,
                    Particle::Flame,
                )
                .await;
        })
    }
}

// ---------------------------------------------------------------------------
// Death handler (fires when a player dies)
// ---------------------------------------------------------------------------

struct DeathHandler;

impl EventHandler<PlayerDeathEvent> for DeathHandler {
    fn handle<'a>(
        &'a self,
        _server: &'a Arc<Server>,
        event: &'a PlayerDeathEvent,
    ) -> BoxFuture<'a, ()> {
        let player = Arc::clone(&event.player);
        let damage_type = event.damage_type;
        Box::pin(async move {
            let name = &player.gameprofile.name;
            let pos = player.living_entity.entity.pos.load();
            info!(
                "Player {name} died (cause: {}) at ({:.1}, {:.1}, {:.1})",
                damage_type.message_id, pos.x, pos.y, pos.z
            );

            player
                .send_system_message(
                    &TextComponent::text(format!(
                        "You were slain! (cause: {})",
                        damage_type.message_id
                    ))
                    .color_named(NamedColor::Red),
                )
                .await;
        })
    }
}

// ---------------------------------------------------------------------------
// Respawn handler (fires when a player respawns after death)
// ---------------------------------------------------------------------------

struct RespawnHandler;

impl EventHandler<PlayerRespawnEvent> for RespawnHandler {
    fn handle<'a>(
        &'a self,
        _server: &'a Arc<Server>,
        event: &'a PlayerRespawnEvent,
    ) -> BoxFuture<'a, ()> {
        let player = Arc::clone(&event.player);
        let is_bed = event.is_bed_spawn;
        Box::pin(async move {
            let name = &player.gameprofile.name;
            info!("Player {name} respawned (bed_spawn={is_bed})");

            player
                .send_system_message(
                    &TextComponent::text("Welcome back! You have respawned.")
                        .color_named(NamedColor::Green),
                )
                .await;
        })
    }
}

// ---------------------------------------------------------------------------
// Orbital strike handler — fires on right-click with cannon or potion
// ---------------------------------------------------------------------------

enum OrbitalWeapon {
    Cannon,
    Potion,
}

struct OrbitalStrikeHandler;

impl EventHandler<PlayerInteractEvent> for OrbitalStrikeHandler {
    fn handle<'a>(
        &'a self,
        _server: &'a Arc<Server>,
        event: &'a PlayerInteractEvent,
    ) -> BoxFuture<'a, ()> {
        let player = Arc::clone(&event.player);
        let action = event.action.clone();
        let item = Arc::clone(&event.item);
        let clicked_pos = event.clicked_pos;

        Box::pin(async move {
            if !action.is_right_click() {
                return;
            }

            // Check if held item is an orbital strike weapon
            let weapon = {
                let stack = item.lock().await;
                match stack.get_data_component::<ItemModelImpl>() {
                    Some(m)
                        if m.model == "kbve:orbital_cannon_a"
                            || m.model == "kbve:orbital_cannon_b" =>
                    {
                        debug!("Detected orbital cannon: {}", m.model);
                        Some(OrbitalWeapon::Cannon)
                    }
                    Some(m)
                        if m.model == "kbve:orbital_strike_potion_a"
                            || m.model == "kbve:orbital_strike_potion_b" =>
                    {
                        debug!("Detected orbital potion: {}", m.model);
                        Some(OrbitalWeapon::Potion)
                    }
                    _ => None,
                }
            };

            let Some(weapon) = weapon else {
                return;
            };

            let name = &player.gameprofile.name;
            let uuid_bits = player.gameprofile.id.as_u128();
            let strike_start = Instant::now();

            // --- Cooldown check ---
            if let Some(last_fire) = ORBITAL_COOLDOWNS.get(&uuid_bits) {
                let since = last_fire.elapsed();
                if since < ORBITAL_COOLDOWN {
                    let remaining = ORBITAL_COOLDOWN - since;
                    debug!(
                        "{name} orbital strike on cooldown ({:.0?} remaining)",
                        remaining
                    );
                    player
                        .send_system_message(
                            &TextComponent::text(format!(
                                "Orbital strike recharging... ({:.1}s)",
                                remaining.as_secs_f32()
                            ))
                            .color_named(NamedColor::Gray)
                            .italic(),
                        )
                        .await;
                    return;
                }
            }
            ORBITAL_COOLDOWNS.insert(uuid_bits, Instant::now());

            let world = player.world();

            // Determine target X,Z from click or look direction
            let (target_x, target_z) = if let Some(pos) = clicked_pos {
                debug!(
                    "{name} orbital strike targeting clicked block ({}, ?, {})",
                    pos.0.x, pos.0.z
                );
                (pos.0.x as f64 + 0.5, pos.0.z as f64 + 0.5)
            } else {
                let eye = player.eye_position();
                let dir = player.living_entity.entity.rotation();
                let range = match weapon {
                    OrbitalWeapon::Cannon => 100.0f64,
                    OrbitalWeapon::Potion => 60.0f64,
                };
                let tx = eye.x + dir.x as f64 * range;
                let tz = eye.z + dir.z as f64 * range;
                debug!(
                    "{name} orbital strike targeting look direction: eye=({:.1}, {:.1}, {:.1}) dir=({:.2}, {:.2}, {:.2}) range={range} → ({:.1}, ?, {:.1})",
                    eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, tx, tz
                );
                (tx, tz)
            };

            // Find ground level at target
            let (surface_y, _) = timed!("get_top_block(strike_target)", {
                world
                    .get_top_block(Vector2::new(target_x as i32, target_z as i32))
                    .await
            });
            let strike_pos = Vector3::new(target_x, f64::from(surface_y) + 1.0, target_z);

            let power = match weapon {
                OrbitalWeapon::Cannon => 6.0,
                OrbitalWeapon::Potion => 4.0,
            };

            info!(
                "{name} firing orbital strike at ({:.1}, {:.1}, {:.1}) power={power}",
                strike_pos.x, strike_pos.y, strike_pos.z
            );

            // --- Phase 1: Particle beam from sky to impact ---
            let beam_top = strike_pos.y + 60.0;
            let (_, beam_dur) = timed!("orbital_phase1_beam", {
                for i in 0..30 {
                    let y = beam_top - (i as f64 * 2.0);
                    world
                        .spawn_particle(
                            Vector3::new(strike_pos.x, y, strike_pos.z),
                            Vector3::new(0.1, 0.0, 0.1),
                            0.02,
                            3,
                            Particle::EndRod,
                        )
                        .await;
                }
            });
            trace!(
                "Phase 1 (beam): 30 calls × 3 EndRod = 90 particles in {:.1?}",
                beam_dur
            );

            // Smoke column at impact point
            let (_, smoke_dur) = timed!("orbital_phase1_smoke", {
                world
                    .spawn_particle(
                        strike_pos,
                        Vector3::new(2.0, 3.0, 2.0),
                        0.05,
                        40,
                        Particle::LargeSmoke,
                    )
                    .await;
            });
            trace!("Phase 1 (smoke): 40 LargeSmoke in {:.1?}", smoke_dur);

            // --- Phase 2: Explosion ---
            let (_, explode_dur) = timed!("orbital_phase2_explode", {
                world.explode(strike_pos, power).await;
            });
            debug!("Phase 2 (explosion): power={power} in {:.1?}", explode_dur);

            // Post-explosion shockwave particles
            let (_, shockwave_dur) = timed!("orbital_phase3_shockwave", {
                world
                    .spawn_particle(
                        strike_pos,
                        Vector3::new(3.0, 1.0, 3.0),
                        0.1,
                        15,
                        Particle::SonicBoom,
                    )
                    .await;
            });
            trace!("Phase 3 (shockwave): 15 SonicBoom in {:.1?}", shockwave_dur);

            // --- Phase 4: Degrade weapon ---
            if matches!(weapon, OrbitalWeapon::Cannon) {
                timed!("orbital_phase4_damage_item", {
                    player.damage_held_item(1).await;
                });
            }

            // --- Feedback ---
            let msg = match weapon {
                OrbitalWeapon::Cannon => "Orbital strike launched!",
                OrbitalWeapon::Potion => "Orbital strike potion deployed!",
            };
            player
                .send_system_message(&TextComponent::text(msg).color_named(NamedColor::Red).bold())
                .await;

            let total = strike_start.elapsed();
            info!(
                "{name} orbital strike complete at ({:.1}, {:.1}, {:.1}) power={power} total={:.1?} (beam={:.1?} smoke={:.1?} explode={:.1?} shockwave={:.1?})",
                strike_pos.x,
                strike_pos.y,
                strike_pos.z,
                total,
                beam_dur,
                smoke_dur,
                explode_dur,
                shockwave_dur
            );
        })
    }
}

// ---------------------------------------------------------------------------
// Axum resource pack server
// ---------------------------------------------------------------------------

async fn serve_resource_pack() {
    use axum::Router;
    use axum::http::header;
    use axum::response::IntoResponse;
    use axum::routing::get;

    const PACK_PATH: &str = "/pumpkin/resource-pack.zip";

    async fn pack_handler() -> impl IntoResponse {
        debug!("Resource pack requested");
        match tokio::fs::read(PACK_PATH).await {
            Ok(bytes) => {
                debug!("Serving resource pack ({} bytes)", bytes.len());
                ([(header::CONTENT_TYPE, "application/zip")], bytes).into_response()
            }
            Err(e) => {
                info!("Failed to read resource pack: {e}");
                (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "Resource pack not found",
                )
                    .into_response()
            }
        }
    }

    let app = Router::new().route("/kbve-resource-pack.zip", get(pack_handler));

    let listener = match tokio::net::TcpListener::bind("0.0.0.0:8080").await {
        Ok(l) => l,
        Err(e) => {
            info!("Failed to bind axum on :8080: {e}");
            return;
        }
    };

    info!("Resource pack server listening on :8080");
    if let Err(e) = axum::serve(listener, app).await {
        info!("Axum server error: {e}");
    }
}

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------

// CRITICAL: #[plugin_method] must be expanded BEFORE #[plugin_impl].
// Rust proc macros expand top-to-bottom. #[plugin_method] stores each method
// in a static HashMap; #[plugin_impl] reads that HashMap to generate the
// Plugin trait impl. If #[plugin_impl] appears first, it reads an empty map
// and the trait gets default no-op methods instead of our custom ones.
impl KbveMcPlugin {
    #[pumpkin_api_macros::plugin_method]
    async fn on_load(&mut self, context: Arc<Context>) -> Result<(), String> {
        const VERSION: &str = env!("CARGO_PKG_VERSION");
        let load_start = Instant::now();
        info!("on_load START (v{VERSION})");
        info!(
            "Trace level: {} (set KBVE_TRACE=1 for DEBUG, KBVE_TRACE=2 for TRACE)",
            *TRACE_LEVEL
        );

        // Register event handlers
        context
            .register_event(Arc::new(WelcomeHandler), EventPriority::Normal, false)
            .await;
        context
            .register_event(Arc::new(ShieldBlockHandler), EventPriority::Normal, false)
            .await;
        context
            .register_event(Arc::new(DeathHandler), EventPriority::Normal, false)
            .await;
        context
            .register_event(Arc::new(RespawnHandler), EventPriority::Normal, false)
            .await;
        context
            .register_event(Arc::new(OrbitalStrikeHandler), EventPriority::Normal, false)
            .await;
        info!("Event handlers registered");

        // Register /kbve command permission (Allow = all players can use it)
        if let Err(e) = context
            .register_permission(Permission::new(
                "kbve-mc-plugin:kbve",
                "Allow /kbve custom item commands",
                PermissionDefault::Allow,
            ))
            .await
        {
            info!("Warning: failed to register permission: {e}");
        }

        // Register /kbve command
        context.register_command(kbve_command_tree(), "kbve").await;
        info!("/kbve command registered");

        // Log item registry contents
        let total = ITEM_REGISTRY.len();
        let potions = ITEM_REGISTRY
            .iter()
            .filter(|e| e.value().potion.is_some())
            .count();
        let weapons = ITEM_REGISTRY
            .iter()
            .filter(|e| e.value().max_damage.is_some())
            .count();
        info!("Item registry: {total} items ({potions} potions, {weapons} weapons)");
        debug!(
            "Items: {:?}",
            ITEM_REGISTRY.iter().map(|e| *e.key()).collect::<Vec<_>>()
        );

        // Spawn resource pack HTTP server (runs in background on GLOBAL_RUNTIME)
        GLOBAL_RUNTIME.spawn(serve_resource_pack());
        info!("Resource pack server spawned");

        info!("on_load END ({:.1?})", load_start.elapsed());
        Ok(())
    }

    #[pumpkin_api_macros::plugin_method]
    async fn on_unload(&mut self, _context: Arc<Context>) -> Result<(), String> {
        info!("on_unload");
        Ok(())
    }
}

#[plugin_impl]
pub struct KbveMcPlugin;

impl Default for KbveMcPlugin {
    fn default() -> Self {
        Self
    }
}

impl KbveMcPlugin {
    pub fn new() -> Self {
        Self
    }
}
