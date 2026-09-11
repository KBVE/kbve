//! What a kill leaves behind.
//!
//! `bevy_inventory` owns the slots, the stacking and the overflow; the only
//! decisions it cannot make for a game are which items exist and what drops.
//! Both live here, and nothing else in the crate needs to know the difference.
//!
//! The drop table is a pure function of the corpse's entity bits rather than a
//! roll. An RNG would have pulled `getrandom` into the wasm build, and a replay
//! of the same fight would loot differently every time; this way the browser
//! and the desktop agree, and so do two runs of the same test.

use bevy::prelude::*;
use bevy_inventory::{InventoryPlugin, ItemKind, LootEvent};
use combat::Died;
use serde::{Deserialize, Serialize};

/// Slots the player carries.
pub const SLOTS: usize = 24;

/// Coins every kill pays out before the per-corpse remainder.
const BASE_COINS: u32 = 3;

/// Everything the player can hold.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Loot {
    Coin,
    Hide,
    Bone,
    Shard,
}

impl ItemKind for Loot {
    fn display_name(&self) -> &'static str {
        match self {
            Loot::Coin => "Coin",
            Loot::Hide => "Hide",
            Loot::Bone => "Bone",
            Loot::Shard => "Shard",
        }
    }

    fn max_stack(&self) -> u32 {
        match self {
            Loot::Coin => 999,
            Loot::Hide | Loot::Bone => 20,
            Loot::Shard => 5,
        }
    }
}

pub struct GameInventoryPlugin;

impl Plugin for GameInventoryPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(InventoryPlugin::<Loot>::new(SLOTS))
            .add_systems(Update, loot_the_dead);
    }
}

/// What a corpse carries, decided by its entity bits.
///
/// Always a coin stack, and always exactly one material, so a kill can never
/// come up empty and a full clear of the dummies yields all three materials.
pub fn drops_for(bits: u64) -> [(Loot, u32); 2] {
    let seed = scramble(bits);
    let material = match seed % 3 {
        0 => Loot::Hide,
        1 => Loot::Bone,
        _ => Loot::Shard,
    };
    [
        (Loot::Coin, BASE_COINS + (seed >> 8) % 5),
        (material, 1 + (seed >> 16) % 2),
    ]
}

/// Mixes the entity bits so that neighbouring indices do not drop the same
/// thing, which is what `bits % 3` on freshly spawned entities would give.
fn scramble(bits: u64) -> u32 {
    let mut hash = bits ^ (bits >> 33);
    hash = hash.wrapping_mul(0xff51_afd7_ed55_8ccd);
    hash ^= hash >> 33;
    hash = hash.wrapping_mul(0xc4ce_b9fe_1a85_ec53);
    (hash ^ (hash >> 33)) as u32
}

/// Pays out the drop table for anything that just died.
///
/// `combat` leaves the corpse in the world precisely so it can be looted; this
/// is the system that takes it up.
fn loot_the_dead(mut deaths: MessageReader<Died>, mut commands: Commands) {
    for death in deaths.read() {
        for (kind, quantity) in drops_for(death.entity.to_bits()) {
            commands.trigger(LootEvent { kind, quantity });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy_inventory::Inventory;

    fn totals(inventory: &Inventory<Loot>, kind: Loot) -> u32 {
        inventory
            .items
            .iter()
            .filter(|stack| stack.kind == kind)
            .map(|stack| stack.quantity)
            .sum()
    }

    #[test]
    fn every_corpse_pays_coins_and_exactly_one_material() {
        for bits in 0..512u64 {
            let drops = drops_for(bits);
            assert_eq!(drops[0].0, Loot::Coin, "bits {bits} paid no coins");
            assert!(drops[0].1 >= BASE_COINS, "bits {bits} paid under the floor");
            assert_ne!(drops[1].0, Loot::Coin, "bits {bits} dropped no material");
            assert!(drops[1].1 >= 1, "bits {bits} dropped an empty stack");
        }
    }

    #[test]
    fn the_drop_table_does_not_depend_on_when_it_is_asked() {
        for bits in 0..64u64 {
            assert_eq!(
                drops_for(bits),
                drops_for(bits),
                "bits {bits} dropped differently on a second call"
            );
        }
    }

    #[test]
    fn consecutive_entities_do_not_all_drop_the_same_material() {
        let mut seen = std::collections::HashSet::new();
        for bits in 0..16u64 {
            seen.insert(drops_for(bits)[1].0);
        }
        assert_eq!(
            seen.len(),
            3,
            "sixteen consecutive corpses produced only {:?}",
            seen
        );
    }

    #[test]
    fn a_death_lands_in_the_inventory() {
        let mut app = App::new();
        app.add_plugins(MinimalPlugins)
            .add_message::<Died>()
            .add_plugins(GameInventoryPlugin);

        let corpse = app.world_mut().spawn_empty().id();
        let expected = drops_for(corpse.to_bits());

        app.world_mut().write_message(Died {
            entity: corpse,
            killer: None,
        });
        app.update();

        let inventory = app.world().resource::<Inventory<Loot>>();
        for (kind, quantity) in expected {
            assert_eq!(
                totals(inventory, kind),
                quantity,
                "{kind:?} did not reach the inventory"
            );
        }
    }

    #[test]
    fn a_second_kill_stacks_onto_the_first() {
        let mut app = App::new();
        app.add_plugins(MinimalPlugins)
            .add_message::<Died>()
            .add_plugins(GameInventoryPlugin);

        let corpse = app.world_mut().spawn_empty().id();
        let coins = drops_for(corpse.to_bits())[0].1;

        for _ in 0..2 {
            app.world_mut().write_message(Died {
                entity: corpse,
                killer: None,
            });
            app.update();
        }

        let inventory = app.world().resource::<Inventory<Loot>>();
        assert_eq!(
            totals(inventory, Loot::Coin),
            coins * 2,
            "the second kill did not stack onto the first"
        );
        assert_eq!(
            inventory.items.len(),
            2,
            "stacking opened new slots instead of filling the old ones"
        );
    }
}
