use super::types::*;

// ── Item registry ───────────────────────────────────────────────────

/// Static item definitions for the dungeon.
pub fn item_registry() -> &'static [ItemDef] {
    static ITEMS: &[ItemDef] = &[
        ItemDef {
            id: "potion",
            name: "Potion",
            emoji: "\u{1F9EA}",
            description: "Restores 15 HP",
            max_stack: 5,
            use_effect: Some(UseEffect::Heal { amount: 15 }),
        },
        ItemDef {
            id: "bandage",
            name: "Bandage",
            emoji: "\u{1F9F7}",
            description: "Heals 5 HP and removes bleed",
            max_stack: 5,
            use_effect: Some(UseEffect::Heal { amount: 5 }),
        },
        ItemDef {
            id: "bomb",
            name: "Bomb",
            emoji: "\u{1F4A3}",
            description: "Deals 10 damage to the enemy",
            max_stack: 3,
            use_effect: Some(UseEffect::DamageEnemy { amount: 10 }),
        },
        ItemDef {
            id: "ward",
            name: "Ward",
            emoji: "\u{1F9FF}",
            description: "Grants Shielded for 2 turns",
            max_stack: 2,
            use_effect: Some(UseEffect::ApplyEffect {
                kind: EffectKind::Shielded,
                stacks: 1,
                turns: 2,
            }),
        },
        ItemDef {
            id: "rations",
            name: "Rations",
            emoji: "\u{1F35E}",
            description: "Heals 8 HP (best used out of combat)",
            max_stack: 3,
            use_effect: Some(UseEffect::Heal { amount: 8 }),
        },
    ];
    ITEMS
}

/// Look up an item definition by ID.
pub fn find_item(id: &str) -> Option<&'static ItemDef> {
    item_registry().iter().find(|item| item.id == id)
}

/// Default starting inventory for a new session.
pub fn starting_inventory() -> Vec<ItemStack> {
    vec![
        ItemStack {
            item_id: "potion".to_owned(),
            qty: 2,
        },
        ItemStack {
            item_id: "bandage".to_owned(),
            qty: 1,
        },
        ItemStack {
            item_id: "bomb".to_owned(),
            qty: 1,
        },
    ]
}

// ── Enemy spawning ──────────────────────────────────────────────────

/// Spawn an enemy scaled to the current room index.
pub fn spawn_enemy(room_index: u32) -> EnemyState {
    match room_index {
        0..=1 => EnemyState {
            name: "Glass Slime".to_owned(),
            level: 1,
            hp: 20,
            max_hp: 20,
            armor: 0,
            effects: Vec::new(),
            intent: Intent::Attack { dmg: 5 },
        },
        2..=3 => EnemyState {
            name: "Skeleton Guard".to_owned(),
            level: 2,
            hp: 30,
            max_hp: 30,
            armor: 3,
            effects: Vec::new(),
            intent: Intent::Defend { armor: 5 },
        },
        4..=5 => EnemyState {
            name: "Shadow Wraith".to_owned(),
            level: 3,
            hp: 25,
            max_hp: 25,
            armor: 2,
            effects: Vec::new(),
            intent: Intent::HeavyAttack { dmg: 12 },
        },
        _ => EnemyState {
            name: "Glass Golem".to_owned(),
            level: 5,
            hp: 60,
            max_hp: 60,
            armor: 8,
            effects: Vec::new(),
            intent: Intent::Charge,
        },
    }
}

// ── Room generation ─────────────────────────────────────────────────

/// Room type sequence: Combat, Treasure, Combat, Rest, Combat, Combat, Boss, ...
fn room_type_for_index(index: u32) -> RoomType {
    match index % 7 {
        0 => RoomType::Combat,
        1 => RoomType::Treasure,
        2 => RoomType::Combat,
        3 => RoomType::RestShrine,
        4 => RoomType::Combat,
        5 => RoomType::Trap,
        6 => RoomType::Boss,
        _ => unreachable!(),
    }
}

/// Generate a room for the given index.
pub fn generate_room(index: u32) -> RoomState {
    let room_type = room_type_for_index(index);

    let (name, description) = match &room_type {
        RoomType::Combat => (
            "Shattered Gallery".to_owned(),
            "Broken mirrors line the walls. Something stirs in the reflections...".to_owned(),
        ),
        RoomType::Treasure => (
            "Crystal Vault".to_owned(),
            "A small chamber glittering with crystalline formations. A chest sits in the center."
                .to_owned(),
        ),
        RoomType::Trap => (
            "Cracked Corridor".to_owned(),
            "The floor is riddled with hairline fractures. Each step could be your last."
                .to_owned(),
        ),
        RoomType::RestShrine => (
            "Luminous Alcove".to_owned(),
            "A warm glow emanates from a shrine embedded in the wall. You feel at peace."
                .to_owned(),
        ),
        RoomType::Merchant => (
            "Wanderer's Nook".to_owned(),
            "A cloaked figure beckons from behind a makeshift stall.".to_owned(),
        ),
        RoomType::Boss => (
            "The Prismatic Throne".to_owned(),
            "An enormous chamber. At its center, a creature of living glass awakens.".to_owned(),
        ),
        RoomType::Story => (
            "Whispering Hall".to_owned(),
            "Voices echo from nowhere. The walls seem to breathe.".to_owned(),
        ),
    };

    let modifiers = if index >= 4 && room_type == RoomType::Combat {
        vec![RoomModifier::Fog {
            accuracy_penalty: 0.1,
        }]
    } else {
        Vec::new()
    };

    RoomState {
        index,
        room_type,
        name,
        description,
        modifiers,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_registry_has_5_items() {
        assert_eq!(item_registry().len(), 5);
    }

    #[test]
    fn find_item_by_id() {
        let potion = find_item("potion");
        assert!(potion.is_some());
        assert_eq!(potion.unwrap().name, "Potion");
    }

    #[test]
    fn find_item_missing() {
        assert!(find_item("nonexistent").is_none());
    }

    #[test]
    fn starting_inventory_has_items() {
        let inv = starting_inventory();
        assert_eq!(inv.len(), 3);
        assert_eq!(inv[0].item_id, "potion");
        assert_eq!(inv[0].qty, 2);
    }

    #[test]
    fn enemy_scaling() {
        let slime = spawn_enemy(0);
        assert_eq!(slime.name, "Glass Slime");
        assert_eq!(slime.level, 1);

        let skeleton = spawn_enemy(2);
        assert_eq!(skeleton.name, "Skeleton Guard");
        assert_eq!(skeleton.level, 2);

        let wraith = spawn_enemy(4);
        assert_eq!(wraith.name, "Shadow Wraith");

        let boss = spawn_enemy(7);
        assert_eq!(boss.name, "Glass Golem");
        assert_eq!(boss.hp, 60);
    }

    #[test]
    fn room_generation_sequence() {
        assert_eq!(generate_room(0).room_type, RoomType::Combat);
        assert_eq!(generate_room(1).room_type, RoomType::Treasure);
        assert_eq!(generate_room(3).room_type, RoomType::RestShrine);
        assert_eq!(generate_room(5).room_type, RoomType::Trap);
        assert_eq!(generate_room(6).room_type, RoomType::Boss);
    }

    #[test]
    fn fog_modifier_applied_at_room_4() {
        let room = generate_room(4);
        assert_eq!(room.modifiers.len(), 1);
        matches!(&room.modifiers[0], RoomModifier::Fog { .. });
    }
}
