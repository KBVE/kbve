using Unity.Entities;
using Unity.Mathematics;
using RareIcon.Native;

namespace RareIcon
{
    public static class UnitColdStoreOps
    {
        public static FfiGhostUnit ToFfi(in UnloadedUnitRecord rec) => new FfiGhostUnit
        {
            unit_type          = rec.Type,
            q                  = rec.Hex.x,
            r                  = rec.Hex.y,
            health             = rec.Health,
            max_health         = rec.HealthMax,
            inv0_id            = rec.Slot0Id, inv0_qty = rec.Slot0Count,
            inv1_id            = rec.Slot1Id, inv1_qty = rec.Slot1Count,
            inv2_id            = rec.Slot2Id, inv2_qty = rec.Slot2Count,
            inv3_id            = rec.Slot3Id, inv3_qty = rec.Slot3Count,
            hunger             = rec.Hunger,
            hunger_max         = rec.HungerMax,
            hunger_per_second  = rec.HungerPerSec,
            fatigue            = rec.Fatigue,
            fatigue_max        = rec.FatigueMax,
            fatigue_per_second = rec.FatiguePerSec,
            energy             = rec.Energy,
            energy_max         = rec.EnergyMax,
            energy_per_second  = rec.EnergyPerSec,
            last_tick_secs     = rec.LastTickSecs,
            attack_damage      = rec.AttackDamage,
            attack_range       = rec.AttackRange,
            attack_cooldown    = rec.AttackCooldown,
            time_since_attack  = rec.TimeSinceAttack,
            attack_kind        = rec.AttackKind,
            target_mode        = rec.TargetMode,
        };

        public static UnloadedUnitRecord FromFfi(in FfiGhostUnit f) => new UnloadedUnitRecord
        {
            Type          = f.unit_type,
            Hex           = new int2(f.q, f.r),
            Health        = (ushort)math.min(f.health,     ushort.MaxValue),
            HealthMax     = (ushort)math.min(f.max_health, ushort.MaxValue),
            Hunger        = (ushort)math.min(f.hunger,     ushort.MaxValue),
            HungerMax     = (ushort)math.min(f.hunger_max, ushort.MaxValue),
            HungerPerSec  = f.hunger_per_second,
            Fatigue       = (ushort)math.min(f.fatigue,    ushort.MaxValue),
            FatigueMax    = (ushort)math.min(f.fatigue_max,ushort.MaxValue),
            FatiguePerSec = f.fatigue_per_second,
            Energy        = (ushort)math.min(f.energy,     ushort.MaxValue),
            EnergyMax     = (ushort)math.min(f.energy_max, ushort.MaxValue),
            EnergyPerSec  = f.energy_per_second,
            LastTickSecs  = f.last_tick_secs,
            Slot0Id       = f.inv0_id, Slot0Count = f.inv0_qty,
            Slot1Id       = f.inv1_id, Slot1Count = f.inv1_qty,
            Slot2Id       = f.inv2_id, Slot2Count = f.inv2_qty,
            Slot3Id       = f.inv3_id, Slot3Count = f.inv3_qty,
            AttackDamage    = f.attack_damage,
            AttackRange     = f.attack_range,
            AttackCooldown  = f.attack_cooldown,
            TimeSinceAttack = f.time_since_attack,
            AttackKind      = f.attack_kind,
            TargetMode      = f.target_mode,
        };

        public static UnloadedUnitRecord Snapshot(EntityManager em, Entity entity, float nowSecs = 0f)
        {
            var rec = new UnloadedUnitRecord { LastTickSecs = nowSecs };

            if (em.HasComponent<Unit>(entity))    rec.Type    = em.GetComponentData<Unit>(entity).Type;
            if (em.HasComponent<Faction>(entity)) rec.Faction = em.GetComponentData<Faction>(entity).Value;

            if (em.HasComponent<UnitMovement>(entity)) rec.Hex = em.GetComponentData<UnitMovement>(entity).CurrentHex;

            if (em.HasComponent<Health>(entity))
            {
                var h = em.GetComponentData<Health>(entity);
                rec.Health    = (ushort)math.min(h.Value, ushort.MaxValue);
                rec.HealthMax = (ushort)math.min(h.Max,   ushort.MaxValue);
            }
            if (em.HasComponent<Energy>(entity))
            {
                var e = em.GetComponentData<Energy>(entity);
                rec.Energy    = (ushort)math.min(e.Value, ushort.MaxValue);
                rec.EnergyMax = (ushort)math.min(e.Max,   ushort.MaxValue);
            }
            if (em.HasComponent<EnergyRegen>(entity))
                rec.EnergyPerSec = em.GetComponentData<EnergyRegen>(entity).PerSecond;
            if (em.HasComponent<Hunger>(entity))
            {
                var h = em.GetComponentData<Hunger>(entity);
                rec.Hunger       = (ushort)math.min(h.Value, ushort.MaxValue);
                rec.HungerMax    = (ushort)math.min(h.Max,   ushort.MaxValue);
                rec.HungerPerSec = h.PerSecond;
            }
            if (em.HasComponent<Fatigue>(entity))
            {
                var f = em.GetComponentData<Fatigue>(entity);
                rec.Fatigue       = (ushort)math.min(f.Value, ushort.MaxValue);
                rec.FatigueMax    = (ushort)math.min(f.Max,   ushort.MaxValue);
                rec.FatiguePerSec = f.PerSecond;
            }
            if (em.HasComponent<UnitName>(entity))
            {
                var n = em.GetComponentData<UnitName>(entity);
                rec.FirstNameId = n.FirstNameId;
                rec.EpithetId   = n.EpithetId;
            }

            if (em.HasComponent<MeleeAttack>(entity))
            {
                var m = em.GetComponentData<MeleeAttack>(entity);
                rec.AttackKind      = CombatAttackKind.Melee;
                rec.AttackDamage    = m.Damage;
                rec.AttackRange     = m.Range;
                rec.AttackCooldown  = m.Cooldown;
                rec.TimeSinceAttack = m.TimeSinceShot;
                rec.TargetMode      = m.TargetMode;
            }
            else if (em.HasComponent<RangedAttack>(entity))
            {
                var r = em.GetComponentData<RangedAttack>(entity);
                rec.AttackKind      = CombatAttackKind.Ranged;
                rec.AttackDamage    = r.Damage;
                rec.AttackRange     = r.Range;
                rec.AttackCooldown  = r.Cooldown;
                rec.TimeSinceAttack = r.TimeSinceShot;
            }
            else if (em.HasComponent<SpellCast>(entity))
            {
                var s = em.GetComponentData<SpellCast>(entity);
                rec.AttackKind      = CombatAttackKind.Spell;
                rec.AttackDamage    = s.Damage;
                rec.AttackRange     = s.Range;
                rec.AttackCooldown  = s.Cooldown;
                rec.TimeSinceAttack = s.TimeSinceCast;
            }

            byte flags = 0;
            if (em.HasComponent<ShelteredInside>(entity)) flags |= UnloadedUnitFlags.Sheltered;
            if (em.HasComponent<TamedTag>(entity))        flags |= UnloadedUnitFlags.Tamed;
            if (em.HasComponent<GarrisonedTag>(entity) && em.IsComponentEnabled<GarrisonedTag>(entity))
                flags |= UnloadedUnitFlags.Garrisoned;
            if (em.HasComponent<Faction>(entity))
            {
                byte f = em.GetComponentData<Faction>(entity).Value;
                if (f == FactionType.Hostile) flags |= UnloadedUnitFlags.Hostile;
            }
            rec.Flags = flags;

            if (em.HasBuffer<PackSlot>(entity))
            {
                var pack = em.GetBuffer<PackSlot>(entity);
                int n = math.min(pack.Length, 4);
                if (n > 0) { rec.Slot0Id = pack[0].ItemId; rec.Slot0Count = pack[0].Count; }
                if (n > 1) { rec.Slot1Id = pack[1].ItemId; rec.Slot1Count = pack[1].Count; }
                if (n > 2) { rec.Slot2Id = pack[2].ItemId; rec.Slot2Count = pack[2].Count; }
                if (n > 3) { rec.Slot3Id = pack[3].ItemId; rec.Slot3Count = pack[3].Count; }
            }

            return rec;
        }

        public static int SnapshotChunk(EntityQuery unitsInChunk,
                                        EntityManager em,
                                        Unity.Collections.NativeList<UnloadedUnitRecord> dest,
                                        int2 chunkLow,
                                        int2 chunkHigh,
                                        float nowSecs = 0f)
        {
            var entities = unitsInChunk.ToEntityArray(Unity.Collections.Allocator.Temp);
            int written = 0;
            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                if (!em.HasComponent<UnitMovement>(e)) continue;
                var hex = em.GetComponentData<UnitMovement>(e).CurrentHex;
                if (hex.x < chunkLow.x || hex.x >= chunkHigh.x) continue;
                if (hex.y < chunkLow.y || hex.y >= chunkHigh.y) continue;

                dest.Add(Snapshot(em, e, nowSecs));
                em.DestroyEntity(e);
                written++;
            }
            entities.Dispose();
            return written;
        }

        public static int DrainChunk(Unity.Collections.NativeList<UnloadedUnitRecord> store, int2 chunkLow, int2 chunkHigh)
        {
            int removed = 0;
            for (int i = store.Length - 1; i >= 0; i--)
            {
                var hex = store[i].Hex;
                if (hex.x < chunkLow.x || hex.x >= chunkHigh.x) continue;
                if (hex.y < chunkLow.y || hex.y >= chunkHigh.y) continue;
                store.RemoveAtSwapBack(i);
                removed++;
            }
            return removed;
        }
    }
}
