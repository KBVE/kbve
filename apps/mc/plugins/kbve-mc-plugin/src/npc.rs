// ── npc.rs — Traveling Merchant NPC (per-player projection) ──────────────
//
//  Per-player projected ArmorStand that acts as a Traveling Merchant.
//  Each player sees their own NPC — it never exists in the world.
//
//  * On join:  send CSpawnEntity + CSetEntityMetadata directly to that player
//  * On right-click:  PlayerInteractUnknownEntityEvent fires → open shop GUI
//  * On leave: send CRemoveEntities + cleanup state
//
//  Purchase flow: player opens shop GUI (read-only display), then runs
//  `/kbve buy <item>` to spend coins.

use std::any::Any;
use std::pin::Pin;
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};

use dashmap::DashMap;
use pumpkin::command::args::ConsumedArgs;
use pumpkin::command::dispatcher::CommandError;
use pumpkin::command::{CommandExecutor, CommandResult, CommandSender};
use pumpkin::entity::player::Player;
use pumpkin::plugin::player::player_interact_unknown_entity_event::PlayerInteractUnknownEntityEvent;
use pumpkin::plugin::{BoxFuture, Cancellable, EventHandler};
use pumpkin::server::Server;
use pumpkin_data::data_component_impl::{DataComponentImpl, ItemModelImpl};
use pumpkin_data::entity::EntityType;
use pumpkin_data::meta_data_type::MetaDataType;
use pumpkin_data::particle::Particle;
use pumpkin_data::tracked_data::TrackedData;
use pumpkin_inventory::generic_container_screen_handler::create_generic_9x3;
use pumpkin_inventory::player::player_inventory::PlayerInventory;
use pumpkin_inventory::screen_handler::{
    BoxFuture as ScreenBoxFuture, InventoryPlayer, ScreenHandlerFactory, SharedScreenHandler,
};
use pumpkin_protocol::java::client::play::{
    CRemoveEntities, CSetEntityMetadata, CSpawnEntity, Metadata,
};
use pumpkin_protocol::java::server::play::ActionType;
use pumpkin_protocol::codec::var_int::VarInt;
use pumpkin_util::math::vector3::Vector3;
use pumpkin_util::text::color::NamedColor;
use pumpkin_util::text::TextComponent;
use pumpkin_util::version::MinecraftVersion;
use pumpkin_world::inventory::{Clearable, Inventory, InventoryFuture};
use pumpkin_world::item::ItemStack;
use tokio::sync::Mutex;
use tracing::{debug, info};
use uuid::Uuid;

use crate::{build_item_stack, ITEM_REGISTRY};

// ── State ──────────────────────────────────────────────────────────────────

/// Player UUID (u128) → their projected merchant entity_id
static PLAYER_MERCHANT_IDS: LazyLock<DashMap<u128, i32>> = LazyLock::new(DashMap::new);

/// Player UUID (u128) → last shop open instant (1-second cooldown)
static SHOP_COOLDOWNS: LazyLock<DashMap<u128, Instant>> = LazyLock::new(DashMap::new);

/// Entity ID counter for projected NPCs. Starts at 100_000 to avoid
/// collision with Pumpkin's internal CURRENT_ID counter.
static NEXT_NPC_ID: AtomicI32 = AtomicI32::new(100_000);

// ── Shop Catalog ───────────────────────────────────────────────────────────

struct ShopEntry {
    item_key: &'static str,
    coin_cost: u8,
}

static SHOP_CATALOG: &[ShopEntry] = &[
    ShopEntry {
        item_key: "sword",
        coin_cost: 3,
    },
    ShopEntry {
        item_key: "scythe",
        coin_cost: 5,
    },
    ShopEntry {
        item_key: "berserker_brew",
        coin_cost: 2,
    },
    ShopEntry {
        item_key: "shadow_veil_elixir",
        coin_cost: 2,
    },
    ShopEntry {
        item_key: "phoenix_tears",
        coin_cost: 4,
    },
    ShopEntry {
        item_key: "iron_skin_tonic",
        coin_cost: 2,
    },
    ShopEntry {
        item_key: "titan_draft",
        coin_cost: 3,
    },
    ShopEntry {
        item_key: "windwalker_serum",
        coin_cost: 2,
    },
];

/// Returns shop catalog item keys (for building the command tree in lib.rs).
pub(crate) fn shop_item_keys() -> Vec<&'static str> {
    SHOP_CATALOG.iter().map(|e| e.item_key).collect()
}

fn find_shop_entry(key: &str) -> Option<&'static ShopEntry> {
    SHOP_CATALOG.iter().find(|e| e.item_key == key)
}

// ── Per-Player NPC Projection ──────────────────────────────────────────────

/// Spawn a Traveling Merchant ArmorStand visible only to this player.
pub(crate) async fn project_merchant(player: &Player, server: &Server) {
    let entity_id = NEXT_NPC_ID.fetch_add(1, Ordering::Relaxed);
    let uuid_bits = player.gameprofile.id.as_u128();

    // Position: near world spawn, offset 3 blocks east and 1 block up
    let info = server.level_info.load();
    let pos = Vector3::new(
        f64::from(info.spawn_x) + 3.5,
        f64::from(info.spawn_y) + 1.0,
        f64::from(info.spawn_z) + 0.5,
    );

    // 1) Spawn entity packet — ArmorStand type (id 5)
    let spawn = CSpawnEntity::new(
        VarInt(entity_id),
        Uuid::new_v4(),
        VarInt(EntityType::ARMOR_STAND.id as i32),
        pos,
        0.0,
        0.0,
        0.0,
        VarInt(0),
        Vector3::new(0.0, 0.0, 0.0),
    );
    player.client.enqueue_packet(&spawn).await;

    // 2) Metadata — invisible body, visible custom name, no gravity, marker
    let metadata_bytes = build_npc_metadata();
    let meta = CSetEntityMetadata::new(VarInt(entity_id), metadata_bytes);
    player.client.enqueue_packet(&meta).await;

    PLAYER_MERCHANT_IDS.insert(uuid_bits, entity_id);
    debug!(
        "Projected merchant (eid={entity_id}) for {}",
        player.gameprofile.name
    );
}

/// Despawn the merchant for this player.
pub(crate) async fn remove_merchant(player: &Player) {
    let uuid_bits = player.gameprofile.id.as_u128();
    if let Some((_, entity_id)) = PLAYER_MERCHANT_IDS.remove(&uuid_bits) {
        let ids = [VarInt(entity_id)];
        let remove = CRemoveEntities::new(&ids);
        player.client.enqueue_packet(&remove).await;
        debug!(
            "Removed merchant (eid={entity_id}) for {}",
            player.gameprofile.name
        );
    }
}

/// Clean up all per-player state (call from LeaveHandler).
pub(crate) fn cleanup_player(uuid_bits: u128) {
    PLAYER_MERCHANT_IDS.remove(&uuid_bits);
    SHOP_COOLDOWNS.remove(&uuid_bits);
}

// ── Metadata Builder ───────────────────────────────────────────────────────

fn build_npc_metadata() -> Box<[u8]> {
    let version = MinecraftVersion::V_1_21_11;
    let mut buf = Vec::new();

    // Entity flags byte: 0x20 = invisible
    Metadata::new(TrackedData::DATA_FLAGS, MetaDataType::BYTE, 0x20i8)
        .write(&mut buf, &version)
        .unwrap();

    // Custom name: "Traveling Merchant" in gold+bold
    let name = TextComponent::text("Traveling Merchant")
        .color_named(NamedColor::Gold)
        .bold();
    Metadata::new(
        TrackedData::DATA_CUSTOM_NAME,
        MetaDataType::OPTIONAL_TEXT_COMPONENT,
        Some(name),
    )
    .write(&mut buf, &version)
    .unwrap();

    // Custom name visible
    Metadata::new(
        TrackedData::DATA_NAME_VISIBLE,
        MetaDataType::BOOLEAN,
        true,
    )
    .write(&mut buf, &version)
    .unwrap();

    // No gravity
    Metadata::new(
        TrackedData::DATA_NO_GRAVITY,
        MetaDataType::BOOLEAN,
        true,
    )
    .write(&mut buf, &version)
    .unwrap();

    // ArmorStand marker flag (invulnerable, no hitbox)
    Metadata::new(
        TrackedData::DATA_ARMOR_STAND_FLAGS,
        MetaDataType::BYTE,
        16i8, // ArmorStandFlags::Marker
    )
    .write(&mut buf, &version)
    .unwrap();

    // Terminator
    buf.push(0xFF);
    buf.into_boxed_slice()
}

// ── Coin Helpers ───────────────────────────────────────────────────────────

const COIN_MODEL: &str = "kbve:kbve_coin";

/// Count how many KBVE Coins the player has.
async fn count_coins(player: &Player) -> u8 {
    let inv = player.inventory();
    let mut total: u16 = 0;
    for slot in 0..Inventory::size(inv.as_ref()) {
        let stack_lock = inv.get_stack(slot).await;
        let stack = stack_lock.lock().await;
        if !stack.is_empty() {
            if let Some(model) = stack.get_data_component_owned::<ItemModelImpl>() {
                if model.model == COIN_MODEL {
                    total += u16::from(stack.item_count);
                }
            }
        }
    }
    total.min(255) as u8
}

/// Remove `count` coins from the player's inventory. Returns `true` if
/// enough coins were found and removed.
async fn remove_coins(player: &Player, count: u8) -> bool {
    let inv = player.inventory();
    let mut remaining = count;

    for slot in 0..Inventory::size(inv.as_ref()) {
        if remaining == 0 {
            break;
        }
        let stack_lock = inv.get_stack(slot).await;
        let stack = stack_lock.lock().await;
        if !stack.is_empty() {
            if let Some(model) = stack.get_data_component_owned::<ItemModelImpl>() {
                if model.model == COIN_MODEL {
                    let available = stack.item_count;
                    let take = remaining.min(available);
                    // Drop lock before mutating through the inventory API
                    drop(stack);
                    inv.remove_stack_specific(slot, take).await;
                    remaining -= take;
                }
            }
        }
    }
    remaining == 0
}

// ── Shop Inventory (read-only display) ─────────────────────────────────────

struct ShopInventory {
    slots: Vec<Arc<Mutex<ItemStack>>>,
}

impl ShopInventory {
    fn new() -> Self {
        let mut slots = Vec::with_capacity(27);

        for entry in SHOP_CATALOG {
            if let Some(def) = ITEM_REGISTRY.get(entry.item_key) {
                if let Some(mut stack) = build_item_stack(def.value()) {
                    // Append price to display name
                    use pumpkin_data::data_component::DataComponent;
                    use pumpkin_data::data_component_impl::CustomNameImpl;

                    let price_name = format!("{} [{} coins]", def.display_name, entry.coin_cost);
                    // Replace existing CustomName component
                    if let Some(pos) = stack
                        .patch
                        .iter()
                        .position(|(dc, _)| *dc == DataComponent::CustomName)
                    {
                        stack.patch[pos] = (
                            DataComponent::CustomName,
                            Some(CustomNameImpl { name: price_name }.to_dyn()),
                        );
                    } else {
                        stack.patch.push((
                            DataComponent::CustomName,
                            Some(CustomNameImpl { name: price_name }.to_dyn()),
                        ));
                    }

                    slots.push(Arc::new(Mutex::new(stack)));
                    continue;
                }
            }
            // Fallback: empty slot
            slots.push(Arc::new(Mutex::new(ItemStack::EMPTY.clone())));
        }

        // Fill remaining 27 - catalog slots with empty
        while slots.len() < 27 {
            slots.push(Arc::new(Mutex::new(ItemStack::EMPTY.clone())));
        }

        Self { slots }
    }
}

impl Clearable for ShopInventory {
    fn clear(&self) -> Pin<Box<dyn std::future::Future<Output = ()> + Send + '_>> {
        Box::pin(async {}) // no-op: read-only
    }
}

impl Inventory for ShopInventory {
    fn size(&self) -> usize {
        27
    }

    fn is_empty(&self) -> InventoryFuture<'_, bool> {
        Box::pin(async { false })
    }

    fn get_stack(&self, slot: usize) -> InventoryFuture<'_, Arc<Mutex<ItemStack>>> {
        Box::pin(async move {
            if slot < self.slots.len() {
                self.slots[slot].clone()
            } else {
                Arc::new(Mutex::new(ItemStack::EMPTY.clone()))
            }
        })
    }

    fn remove_stack(&self, _slot: usize) -> InventoryFuture<'_, ItemStack> {
        Box::pin(async { ItemStack::EMPTY.clone() }) // no-op: read-only
    }

    fn remove_stack_specific(&self, _slot: usize, _amount: u8) -> InventoryFuture<'_, ItemStack> {
        Box::pin(async { ItemStack::EMPTY.clone() }) // no-op: read-only
    }

    fn set_stack(&self, _slot: usize, _stack: ItemStack) -> InventoryFuture<'_, ()> {
        Box::pin(async {}) // no-op: read-only
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

// ── Shop Screen Factory ───────────────────────────────────────────────────

struct ShopScreenFactory {
    inventory: Arc<dyn Inventory>,
}

impl ScreenHandlerFactory for ShopScreenFactory {
    fn create_screen_handler<'a>(
        &'a self,
        sync_id: u8,
        player_inventory: &'a Arc<PlayerInventory>,
        _player: &'a dyn InventoryPlayer,
    ) -> ScreenBoxFuture<'a, Option<SharedScreenHandler>> {
        Box::pin(async move {
            let handler =
                create_generic_9x3(sync_id, player_inventory, self.inventory.clone()).await;
            Some(Arc::new(Mutex::new(handler)) as SharedScreenHandler)
        })
    }

    fn get_display_name(&self) -> TextComponent {
        TextComponent::text("Traveling Merchant")
            .color_named(NamedColor::Gold)
            .bold()
    }
}

// ── Open Shop GUI ──────────────────────────────────────────────────────────

async fn open_shop(player: &Player) {
    let uuid_bits = player.gameprofile.id.as_u128();

    // 1-second cooldown
    if let Some(last) = SHOP_COOLDOWNS.get(&uuid_bits) {
        if last.elapsed() < Duration::from_secs(1) {
            return;
        }
    }
    SHOP_COOLDOWNS.insert(uuid_bits, Instant::now());

    // Build fresh shop inventory
    let shop_inv = Arc::new(ShopInventory::new());
    let factory = ShopScreenFactory {
        inventory: shop_inv,
    };

    player.open_handled_screen(&factory, None).await;

    // Show coin balance
    let coins = count_coins(player).await;
    player
        .send_system_message(
            &TextComponent::text(format!("Your balance: {coins} KBVE Coins"))
                .color_named(NamedColor::Gold),
        )
        .await;
}

// ── Merchant Interact Handler ──────────────────────────────────────────────

/// Handles right-click (and cancels left-click) on projected merchant NPCs.
/// Uses PlayerInteractUnknownEntityEvent because the NPC only exists as
/// client-side packets — Pumpkin won't find it in the world entity list.
pub(crate) struct MerchantInteractHandler;

impl EventHandler<PlayerInteractUnknownEntityEvent> for MerchantInteractHandler {
    fn handle_blocking<'a>(
        &'a self,
        _server: &'a Arc<Server>,
        event: &'a mut PlayerInteractUnknownEntityEvent,
    ) -> BoxFuture<'a, ()> {
        Box::pin(async move {
            let uuid_bits = event.player.gameprofile.id.as_u128();

            // Check if this entity_id belongs to this player's merchant
            let is_merchant = PLAYER_MERCHANT_IDS
                .get(&uuid_bits)
                .is_some_and(|id| *id == event.entity_id);

            if !is_merchant {
                return;
            }

            // Always cancel to prevent default behavior (kick on attack)
            event.set_cancelled(true);

            match event.action {
                ActionType::Interact | ActionType::InteractAt => {
                    open_shop(&event.player).await;
                }
                ActionType::Attack => {
                    // Cancelled above — prevents kick. Send a hint.
                    event
                        .player
                        .send_system_message(
                            &TextComponent::text("Right-click the merchant to browse the shop!")
                                .color_named(NamedColor::Yellow),
                        )
                        .await;
                }
            }
        })
    }
}

// ── Buy Item Executor ─────────────────────────────────────────────────────

/// Command executor for `/kbve buy <item>`.
pub(crate) struct BuyItemExecutor {
    pub item_key: &'static str,
}

impl CommandExecutor for BuyItemExecutor {
    fn execute<'a>(
        &'a self,
        sender: &'a CommandSender,
        _server: &'a Server,
        _args: &'a ConsumedArgs<'a>,
    ) -> CommandResult<'a> {
        Box::pin(async move {
            let player = match sender.as_player() {
                Some(p) => p,
                None => {
                    return Err(CommandError::CommandFailed(TextComponent::text(
                        "Only players can buy items",
                    )));
                }
            };

            let entry = find_shop_entry(self.item_key).ok_or_else(|| {
                CommandError::CommandFailed(TextComponent::text("Unknown shop item"))
            })?;

            let def = ITEM_REGISTRY.get(entry.item_key).ok_or_else(|| {
                CommandError::CommandFailed(TextComponent::text("Item not found in registry"))
            })?;

            // Check balance
            let coins = count_coins(&player).await;
            if coins < entry.coin_cost {
                player
                    .send_system_message(
                        &TextComponent::text(format!(
                            "Not enough coins! Need {} but you have {}.",
                            entry.coin_cost, coins
                        ))
                        .color_named(NamedColor::Red),
                    )
                    .await;
                return Ok(0);
            }

            // Deduct coins
            if !remove_coins(&player, entry.coin_cost).await {
                player
                    .send_system_message(
                        &TextComponent::text("Failed to deduct coins — try again.")
                            .color_named(NamedColor::Red),
                    )
                    .await;
                return Ok(0);
            }

            // Build and give item
            let mut stack = build_item_stack(def.value()).ok_or_else(|| {
                CommandError::CommandFailed(TextComponent::text("Failed to build item"))
            })?;

            player.inventory().insert_stack_anywhere(&mut stack).await;

            // Drop if inventory full
            if !stack.is_empty() {
                player.drop_item(stack).await;
            }

            // Spawn particles
            if let Some((particle, count)) = &def.particle {
                let pos = player.living_entity.entity.pos.load();
                player
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

            // Success message
            let remaining = count_coins(&player).await;
            player
                .send_system_message(
                    &TextComponent::text(format!(
                        "Purchased {} for {} coins! (Balance: {})",
                        def.display_name, entry.coin_cost, remaining
                    ))
                    .color_named(NamedColor::Green),
                )
                .await;

            info!(
                "{} bought {} for {} coins",
                player.gameprofile.name, self.item_key, entry.coin_cost
            );

            Ok(1)
        })
    }
}

// ── Shop Command Executor ─────────────────────────────────────────────────

/// Command executor for `/kbve shop` — opens the shop GUI directly.
pub(crate) struct ShopCommandExecutor;

impl CommandExecutor for ShopCommandExecutor {
    fn execute<'a>(
        &'a self,
        sender: &'a CommandSender,
        _server: &'a Server,
        _args: &'a ConsumedArgs<'a>,
    ) -> CommandResult<'a> {
        Box::pin(async move {
            let player = match sender.as_player() {
                Some(p) => p,
                None => {
                    return Err(CommandError::CommandFailed(TextComponent::text(
                        "Only players can use the shop",
                    )));
                }
            };

            open_shop(&player).await;
            Ok(1)
        })
    }
}
