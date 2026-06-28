use std::collections::HashMap;

use bevy::ecs::entity::Entity;
use bevy::ecs::system::SystemParam;
use bevy::prelude::{Commands, Res, ResMut};
use bevy_spells::{SpellDb, SpellEffect};

use crate::combat;
use crate::data::KindRegistry;
use crate::grid::WalkableMap;
use crate::sim::{
    AttackMobQuery, AttackPlayerQuery, EidIndex, EquipmentEffects, KillCounts, Outbound,
    RespawnQueue, SIM_TICK_HZ, SimClock, SimConfig, SimSeed, SpellCooldowns,
    broadcast_player_stats, resolve_attack_hit,
};
use crate::spells::PendingSpells;
use crate::spells::net::send_spell_result;

fn cooldown_ticks(cooldown_ms: u32) -> u32 {
    let tick_ms = 1000 / SIM_TICK_HZ;
    cooldown_ms.div_ceil(tick_ms.max(1))
}

#[derive(SystemParam)]
pub struct SpellContext<'w> {
    db: Res<'w, SpellDb>,
    index: Res<'w, EidIndex>,
    registry: Res<'w, KindRegistry>,
    bcast: Res<'w, Outbound>,
    clock: Res<'w, SimClock>,
    seed: Res<'w, SimSeed>,
    config: Res<'w, SimConfig>,
    equipment: Res<'w, EquipmentEffects>,
    map: Res<'w, WalkableMap>,
}

#[allow(clippy::type_complexity, clippy::too_many_arguments)]
pub fn apply_spells(
    mut pending: ResMut<PendingSpells>,
    ctx: SpellContext,
    mut cooldowns: ResMut<SpellCooldowns>,
    mut respawns: ResMut<RespawnQueue>,
    mut kill_counts: ResMut<KillCounts>,
    mut commands: Commands,
    mut q_players: AttackPlayerQuery,
    mut q_mobs: AttackMobQuery,
) {
    let db: &SpellDb = &ctx.db;
    let index: &EidIndex = &ctx.index;
    let registry: &KindRegistry = &ctx.registry;
    let bcast: &Outbound = &ctx.bcast;
    let clock: &SimClock = &ctx.clock;
    let seed: &SimSeed = &ctx.seed;
    let config: &SimConfig = &ctx.config;
    let equipment: &EquipmentEffects = &ctx.equipment;
    let map: &WalkableMap = &ctx.map;
    if pending.0.is_empty() {
        return;
    }
    let drained: Vec<_> = pending.0.drain(..).collect();

    let mut by_slot: HashMap<u16, Entity> = HashMap::new();
    for (entity, slot, ..) in q_players.iter() {
        by_slot.insert(slot.0.0, entity);
    }

    for (slot, spell_ref, target) in drained {
        let Some(&player_entity) = by_slot.get(&slot.0) else {
            continue;
        };
        let caster = player_entity.index_u32();
        let target_eid = target.map(|t| t.0);

        let reject = |bcast: &Outbound, effect: &str, reason: &str| {
            send_spell_result(
                bcast, slot, caster, target_eid, &spell_ref, effect, 0, false, reason,
            );
        };

        let Some(spell) = db.get_by_ref(&spell_ref).cloned() else {
            reject(bcast, "rejected", "unknown_spell");
            continue;
        };

        let mana_cost = spell.mana_cost.unwrap_or(0) as i32;
        let power = spell.power.unwrap_or(0);
        let range = spell.range.unwrap_or(0) as i32;
        let cd_ms = spell.cooldown_ms.unwrap_or(0);
        let key = (slot.0, spell_ref.clone());

        let Ok((_, _, _, _, _, _, _, _, mana, _, _)) = q_players.get(player_entity) else {
            continue;
        };
        if mana.mp < mana_cost {
            reject(bcast, "rejected", "no_mana");
            continue;
        }

        if let Some(&next) = cooldowns.0.get(&key)
            && clock.tick < next
        {
            reject(bcast, "rejected", "cooldown");
            continue;
        }

        let effect = SpellEffect::try_from(spell.effect).unwrap_or(SpellEffect::Unspecified);

        match effect {
            SpellEffect::Heal => {
                let Ok((_, _, _, _, _, mut health, _, _, mut mana, _, _)) =
                    q_players.get_mut(player_entity)
                else {
                    continue;
                };
                let before = health.hp;
                health.hp = (health.hp + power).min(health.max_hp);
                let healed = health.hp - before;
                mana.mp -= mana_cost;
                if cd_ms > 0 {
                    cooldowns.0.insert(key, clock.tick + cooldown_ticks(cd_ms));
                }
                send_spell_result(
                    bcast, slot, caster, target_eid, &spell_ref, "heal", healed, true, "",
                );
                let Ok((_, _, _, stats, _, health, xp, _, mana, _, _)) =
                    q_players.get(player_entity)
                else {
                    continue;
                };
                let kills = kill_counts.0.get(&slot.0).copied().unwrap_or(0);
                broadcast_player_stats(bcast, slot, xp, health, stats, mana, kills);
            }
            SpellEffect::Damage => {
                if let Ok((_, _, _, _, _, _, _, _, mut mana, _, _)) =
                    q_players.get_mut(player_entity)
                {
                    mana.mp -= mana_cost;
                }
                if cd_ms > 0 {
                    cooldowns.0.insert(key, clock.tick + cooldown_ticks(cd_ms));
                }

                let reach = if range > 0 { range } else { combat::BOW_RANGE };
                let caster_tile = q_players.get(player_entity).ok().map(|q| q.2.tile);
                let mut hit: Option<Entity> = None;
                if let (Some(ct), Some(te)) = (
                    caster_tile,
                    target_eid.and_then(|e| index.by_eid.get(&e).copied()),
                ) && let Some(tt) = q_mobs.get(te).ok().map(|q| q.0.tile)
                {
                    let path = combat::line_cast(ct, tt, reach, |t| !map.is_walkable(t));
                    if path.last().copied() == Some(tt) {
                        hit = Some(te);
                    }
                }

                if let Some(te) = hit {
                    resolve_attack_hit(
                        player_entity,
                        te,
                        slot,
                        power,
                        bcast,
                        registry,
                        clock,
                        seed,
                        config,
                        equipment,
                        &mut respawns,
                        &mut kill_counts,
                        &mut commands,
                        &mut q_players,
                        &mut q_mobs,
                    );
                    send_spell_result(
                        bcast, slot, caster, target_eid, &spell_ref, "damage", power, true, "",
                    );
                } else {
                    send_spell_result(
                        bcast, slot, caster, target_eid, &spell_ref, "miss", 0, true, "",
                    );
                }

                if let Ok((_, _, _, stats, _, health, xp, _, mana, _, _)) =
                    q_players.get(player_entity)
                {
                    let kills = kill_counts.0.get(&slot.0).copied().unwrap_or(0);
                    broadcast_player_stats(bcast, slot, xp, health, stats, mana, kills);
                }
            }
            _ => {
                send_spell_result(
                    bcast,
                    slot,
                    caster,
                    target_eid,
                    &spell_ref,
                    "rejected",
                    0,
                    false,
                    "unimplemented",
                );
            }
        }
    }
}
