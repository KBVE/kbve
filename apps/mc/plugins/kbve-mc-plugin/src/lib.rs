#![allow(unused_imports, clippy::async_yields_async)]

use std::sync::atomic::Ordering;
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use dashmap::DashMap;
use pumpkin::command::args::players::PlayersArgumentConsumer;
use pumpkin::command::args::{ConsumedArgs, FindArgDefaultName};
use pumpkin::command::dispatcher::CommandError;
use pumpkin::command::tree::CommandTree;
use pumpkin::command::tree::builder::{argument_default_name, literal};
use pumpkin::command::{CommandExecutor, CommandResult, CommandSender};
use pumpkin::entity::EntityBase;
use pumpkin::plugin::api::Context;
use pumpkin::plugin::player::player_interact_entity_event::PlayerInteractEntityEvent;
use pumpkin::plugin::player::player_join::PlayerJoinEvent;
use pumpkin::plugin::{BoxFuture, EventHandler, EventPriority};
use pumpkin::server::Server;
use pumpkin_api_macros::plugin_impl;
use pumpkin_data::damage::DamageType;
use pumpkin_data::data_component::DataComponent;
use pumpkin_data::data_component_impl::{
    CustomNameImpl, DamageImpl, DataComponentImpl, ItemModelImpl, MaxDamageImpl,
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

            eprintln!("[kbve-mc-plugin] Sending welcome to {name} ({uuid})");

            // Capture BEFORE the sleep — spawn_java_player runs concurrently and
            // sets has_played_before = true at world/mod.rs:1881 during the delay.
            let is_first_join = !player.has_played_before.load(Ordering::Relaxed);
            eprintln!("[kbve-mc-plugin] is_first_join={is_first_join} for {name}");

            // Brief delay so the client finishes the login sequence before we send messages.
            // Use std::thread::sleep because the cdylib plugin has its own tokio statics
            // and cannot access the host runtime's timer driver.
            thread::sleep(Duration::from_secs(2));

            let welcome = TextComponent::text(format!("Welcome to KBVE, {name}!"))
                .color_named(NamedColor::Gold)
                .bold();

            let uuid_msg = TextComponent::text(format!("Your UUID: {uuid}"))
                .color_named(NamedColor::Gray)
                .italic();

            player.send_system_message(&welcome).await;
            player.send_system_message(&uuid_msg).await;

            // For first-time players, ensure they spawn on solid ground (not ocean).
            // Pumpkin defaults world spawn to (0, y, 0) which is often ocean.
            // We check the world spawn surface block (not player position, since
            // gravity may have moved them to the ocean floor during the sleep).
            if is_first_join {
                let world = player.world();
                let info = server.level_info.load();
                let spawn_x = info.spawn_x;
                let spawn_z = info.spawn_z;

                let top_y = world.get_top_block(Vector2::new(spawn_x, spawn_z)).await;
                let surface_block = world
                    .get_block(&BlockPos::new(spawn_x, top_y, spawn_z))
                    .await;

                eprintln!(
                    "[kbve-mc-plugin] Spawn surface check at ({}, {}, {}): solid={}",
                    spawn_x,
                    top_y,
                    spawn_z,
                    surface_block.is_solid(),
                );

                if !surface_block.is_solid() {
                    eprintln!(
                        "[kbve-mc-plugin] {name} spawned on non-solid ground, searching for land..."
                    );

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
                            let check_x = spawn_x + dx;
                            let check_z = spawn_z + dz;
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

                                eprintln!(
                                    "[kbve-mc-plugin] Found land at ({}, {}, {}) — teleporting {name}",
                                    check_x,
                                    check_top + 1,
                                    check_z,
                                );

                                player.request_teleport(land_pos, 0.0, 0.0).await;

                                // Update world spawn so future players land here too
                                let current_info = server.level_info.load();
                                let mut new_info = (**current_info).clone();
                                new_info.spawn_x = check_x;
                                new_info.spawn_y = check_top + 1;
                                new_info.spawn_z = check_z;
                                server.level_info.store(Arc::new(new_info));

                                eprintln!(
                                    "[kbve-mc-plugin] World spawn updated to ({}, {}, {})",
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
                    }
                }
            }
        })
    }
}

// ---------------------------------------------------------------------------
// Item registry — DashMap keyed by command name
// ---------------------------------------------------------------------------

struct ItemDef {
    base_item_key: &'static str,
    model: &'static str,
    display_name: &'static str,
    message_color: NamedColor,
    particle: Option<(Particle, i32)>,
    max_damage: Option<i32>,
}

static ITEM_REGISTRY: LazyLock<DashMap<&'static str, ItemDef>> = LazyLock::new(|| {
    let map = DashMap::new();
    map.insert(
        "coin",
        ItemDef {
            base_item_key: "gold_nugget",
            model: "kbve:kbve_coin",
            display_name: "KBVE Coin",
            message_color: NamedColor::Gold,
            particle: None,
            max_damage: None,
        },
    );
    map.insert(
        "sword",
        ItemDef {
            base_item_key: "diamond_sword",
            model: "kbve:kbve_sword",
            display_name: "KBVE Sword",
            message_color: NamedColor::Aqua,
            particle: None,
            max_damage: None,
        },
    );
    map.insert(
        "rust_stone",
        ItemDef {
            base_item_key: "stone",
            model: "kbve:rust_stone",
            display_name: "Rust Stone",
            message_color: NamedColor::Red,
            particle: Some((Particle::Flame, 15)),
            max_damage: None,
        },
    );
    map.insert(
        "spartan_shield",
        ItemDef {
            base_item_key: "shield",
            model: "kbve:spartan_shield",
            display_name: "Spartan Shield",
            message_color: NamedColor::DarkRed,
            particle: Some((Particle::Flame, 10)),
            // Vanilla shield = 336; mid-tier, breaks faster
            max_damage: Some(200),
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
            let item = Item::from_registry_key(def.base_item_key).ok_or_else(|| {
                CommandError::CommandFailed(TextComponent::text(format!(
                    "{} not found",
                    def.base_item_key
                )))
            })?;

            for target in targets {
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

                target.inventory().insert_stack_anywhere(&mut stack).await;
                if !stack.is_empty() {
                    target.drop_item(stack).await;
                }

                if let Some((particle, count)) = &def.particle {
                    let pos = target.living_entity.entity.pos.load();
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
                return;
            }

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
// Axum resource pack server
// ---------------------------------------------------------------------------

async fn serve_resource_pack() {
    use axum::Router;
    use axum::http::header;
    use axum::response::IntoResponse;
    use axum::routing::get;

    const PACK_PATH: &str = "/pumpkin/resource-pack.zip";

    async fn pack_handler() -> impl IntoResponse {
        match tokio::fs::read(PACK_PATH).await {
            Ok(bytes) => ([(header::CONTENT_TYPE, "application/zip")], bytes).into_response(),
            Err(e) => {
                eprintln!("[kbve-mc-plugin] Failed to read resource pack: {e}");
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
            eprintln!("[kbve-mc-plugin] Failed to bind axum on :8080: {e}");
            return;
        }
    };

    eprintln!("[kbve-mc-plugin] Resource pack server listening on :8080");
    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("[kbve-mc-plugin] Axum server error: {e}");
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
        eprintln!("[kbve-mc-plugin] on_load START");

        // Register event handlers
        context
            .register_event(Arc::new(WelcomeHandler), EventPriority::Normal, false)
            .await;
        context
            .register_event(Arc::new(ShieldBlockHandler), EventPriority::Normal, false)
            .await;
        eprintln!("[kbve-mc-plugin] Event handlers registered");

        // Register /kbve command permission (Allow = all players can use it)
        if let Err(e) = context
            .register_permission(Permission::new(
                "kbve-mc-plugin:kbve",
                "Allow /kbve custom item commands",
                PermissionDefault::Allow,
            ))
            .await
        {
            eprintln!("[kbve-mc-plugin] Warning: failed to register permission: {e}");
        }

        // Register /kbve command
        context.register_command(kbve_command_tree(), "kbve").await;
        eprintln!("[kbve-mc-plugin] /kbve command registered");

        // Spawn resource pack HTTP server (runs in background on GLOBAL_RUNTIME)
        GLOBAL_RUNTIME.spawn(serve_resource_pack());
        eprintln!("[kbve-mc-plugin] Resource pack server spawned");

        eprintln!("[kbve-mc-plugin] on_load END");
        Ok(())
    }

    #[pumpkin_api_macros::plugin_method]
    async fn on_unload(&mut self, _context: Arc<Context>) -> Result<(), String> {
        eprintln!("[kbve-mc-plugin] on_unload");
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
