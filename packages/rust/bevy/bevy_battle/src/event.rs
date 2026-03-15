//! Battle messages — input intents and output outcomes.
//!
//! Uses Bevy 0.18's `Message` system (queue-based) so the bridge can
//! write intents, call `app.update()`, then read outcomes.

use bevy::prelude::*;

use crate::types::{EffectKind, UseEffect};

// ── Input messages (written by bridge before app.update()) ─────────

/// Player attacks a target enemy.
#[derive(Message, Debug, Clone)]
pub struct AttackIntent {
    pub attacker: Entity,
    pub target: Entity,
}

/// Player defends this turn.
#[derive(Message, Debug, Clone)]
pub struct DefendIntent {
    pub entity: Entity,
}

/// Player attempts to flee.
#[derive(Message, Debug, Clone)]
pub struct FleeIntent {
    pub entity: Entity,
    pub depth: u32,
}

/// Player uses a consumable item.
#[derive(Message, Debug, Clone)]
pub struct UseItemIntent {
    pub user: Entity,
    pub target: Option<Entity>,
    pub effect: UseEffect,
}

/// Trigger all enemies to execute their turns.
#[derive(Message, Debug, Clone)]
pub struct EnemyTurnRequest;

/// Trigger effect ticking on all combatants.
#[derive(Message, Debug, Clone)]
pub struct TickEffectsRequest;

// ── Output messages (collected by bridge after app.update()) ───────

/// Structured combat outcome — bridge converts these to flavor text.
#[derive(Message, Debug, Clone)]
pub enum CombatOutcome {
    Attack {
        attacker: Entity,
        target: Entity,
        damage: i32,
        crit: bool,
        overkill: bool,
    },
    Miss {
        attacker: Entity,
        target: Entity,
    },
    Defend {
        entity: Entity,
    },
    EffectApplied {
        target: Entity,
        effect: EffectKind,
        stacks: u8,
        turns: u8,
    },
    EffectTick {
        target: Entity,
        effect: EffectKind,
        damage: i32,
    },
    EffectExpired {
        target: Entity,
        effect: EffectKind,
    },
    ClassProc {
        entity: Entity,
        proc_name: &'static str,
        detail: String,
    },
    Lifesteal {
        entity: Entity,
        healed: i32,
    },
    Thorns {
        target: Entity,
        reflected: i32,
    },
    Death {
        entity: Entity,
        is_player: bool,
    },
    FleeResult {
        entity: Entity,
        success: bool,
    },
    EnemyFled {
        entity: Entity,
    },
    EnemyDefend {
        entity: Entity,
        armor_gained: i32,
    },
    EnemyHeal {
        entity: Entity,
        healed: i32,
    },
    EnemyAttack {
        attacker: Entity,
        target: Entity,
        damage: i32,
        is_heavy: bool,
    },
    EnemyAoe {
        attacker: Entity,
        per_target: Vec<(Entity, i32)>,
    },
    EnemyDebuff {
        attacker: Entity,
        target: Entity,
        effect: EffectKind,
        stacks: u8,
        turns: u8,
    },
    Stunned {
        entity: Entity,
    },
}
