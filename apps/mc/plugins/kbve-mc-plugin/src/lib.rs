#![allow(unused_imports, clippy::async_yields_async)]

use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::Duration;

use pumpkin::command::args::players::PlayersArgumentConsumer;
use pumpkin::command::args::{ConsumedArgs, FindArgDefaultName};
use pumpkin::command::dispatcher::CommandError;
use pumpkin::command::tree::CommandTree;
use pumpkin::command::tree::builder::{argument_default_name, literal};
use pumpkin::command::{CommandExecutor, CommandResult, CommandSender};
use pumpkin::plugin::api::Context;
use pumpkin::plugin::player::player_join::PlayerJoinEvent;
use pumpkin::plugin::{BoxFuture, EventHandler, EventPriority};
use pumpkin::server::Server;
use pumpkin_api_macros::plugin_impl;
use pumpkin_data::data_component::DataComponent;
use pumpkin_data::data_component_impl::{CustomNameImpl, DataComponentImpl, ItemModelImpl};
use pumpkin_data::item::Item;
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
// /kbve give <coin|sword> command
// ---------------------------------------------------------------------------

struct GiveCoinExecutor;
struct GiveSwordExecutor;

fn give_custom_item(item: &'static Item, model: &str, name: &str) -> ItemStack {
    let mut stack = ItemStack::new(1, item);
    stack.patch.push((
        DataComponent::ItemModel,
        Some(
            ItemModelImpl {
                model: model.to_string(),
            }
            .to_dyn(),
        ),
    ));
    stack.patch.push((
        DataComponent::CustomName,
        Some(
            CustomNameImpl {
                name: name.to_string(),
            }
            .to_dyn(),
        ),
    ));
    stack
}

impl CommandExecutor for GiveCoinExecutor {
    fn execute<'a>(
        &'a self,
        sender: &'a CommandSender,
        _server: &'a Server,
        args: &'a ConsumedArgs<'a>,
    ) -> CommandResult<'a> {
        Box::pin(async move {
            let targets = PlayersArgumentConsumer.find_arg_default_name(args)?;
            let item = Item::from_registry_key("gold_nugget").ok_or_else(|| {
                CommandError::CommandFailed(TextComponent::text("gold_nugget not found"))
            })?;

            for target in targets {
                let mut stack = give_custom_item(item, "kbve:kbve_coin", "KBVE Coin");
                target.inventory().insert_stack_anywhere(&mut stack).await;
                if !stack.is_empty() {
                    target.drop_item(stack).await;
                }
            }

            sender
                .send_message(TextComponent::text("Gave KBVE Coin!").color_named(NamedColor::Gold))
                .await;
            Ok(1)
        })
    }
}

impl CommandExecutor for GiveSwordExecutor {
    fn execute<'a>(
        &'a self,
        sender: &'a CommandSender,
        _server: &'a Server,
        args: &'a ConsumedArgs<'a>,
    ) -> CommandResult<'a> {
        Box::pin(async move {
            let targets = PlayersArgumentConsumer.find_arg_default_name(args)?;
            let item = Item::from_registry_key("diamond_sword").ok_or_else(|| {
                CommandError::CommandFailed(TextComponent::text("diamond_sword not found"))
            })?;

            for target in targets {
                let mut stack = give_custom_item(item, "kbve:kbve_sword", "KBVE Sword");
                target.inventory().insert_stack_anywhere(&mut stack).await;
                if !stack.is_empty() {
                    target.drop_item(stack).await;
                }
            }

            sender
                .send_message(TextComponent::text("Gave KBVE Sword!").color_named(NamedColor::Aqua))
                .await;
            Ok(1)
        })
    }
}

fn kbve_command_tree() -> CommandTree {
    CommandTree::new(["kbve"], "KBVE custom items").then(
        literal("give")
            .then(
                literal("coin")
                    .then(argument_default_name(PlayersArgumentConsumer).execute(GiveCoinExecutor)),
            )
            .then(
                literal("sword").then(
                    argument_default_name(PlayersArgumentConsumer).execute(GiveSwordExecutor),
                ),
            ),
    )
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

        // Register welcome event handler
        context
            .register_event(Arc::new(WelcomeHandler), EventPriority::Normal, false)
            .await;
        eprintln!("[kbve-mc-plugin] Welcome handler registered");

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
