using Unity.Entities;
using Unity.Mathematics;
using RareIcon.Native;

namespace RareIcon
{
    /// <summary>Field-order-stable converters between <see cref="UnloadedBuildingRecord"/> and the FFI mirror <see cref="FfiUnloadedBuilding"/>. Mirrors <see cref="UnitColdStoreOps"/>; both layouts are repr(C) on the Rust side so the two structs share their byte-for-byte memory shape — never reorder fields without bumping the persistence schema version.</summary>
    public static class BuildingColdStoreOps
    {
        public static FfiUnloadedBuilding ToFfi(in UnloadedBuildingRecord rec) => new FfiUnloadedBuilding
        {
            building_type          = rec.Type,
            root_q                 = rec.RootHex.x,
            root_r                 = rec.RootHex.y,
            owner_faction          = rec.OwnerFaction,
            health                 = rec.Health,
            health_max             = rec.HealthMax,
            tier                   = rec.Tier,
            last_tick_turn         = rec.LastTickTurn,
            accrued_production     = rec.AccruedProduction,
            accrued_input          = rec.AccruedInput,
            flags                  = rec.Flags,
            recipe_cycle_remaining = rec.RecipeCycleRemaining,
            slot0_id    = rec.Slot0Id, slot0_count = rec.Slot0Count,
            slot1_id    = rec.Slot1Id, slot1_count = rec.Slot1Count,
            slot2_id    = rec.Slot2Id, slot2_count = rec.Slot2Count,
            slot3_id    = rec.Slot3Id, slot3_count = rec.Slot3Count,
            attack_damage     = rec.AttackDamage,
            attack_range      = rec.AttackRange,
            attack_cooldown   = rec.AttackCooldown,
            time_since_attack = rec.TimeSinceAttack,
            attack_kind       = rec.AttackKind,
            target_mode       = rec.TargetMode,
        };

        public static UnloadedBuildingRecord FromFfi(in FfiUnloadedBuilding f) => new UnloadedBuildingRecord
        {
            Type              = f.building_type,
            RootHex           = new int2(f.root_q, f.root_r),
            OwnerFaction      = f.owner_faction,
            Health            = f.health,
            HealthMax         = f.health_max,
            Tier              = f.tier,
            LastTickTurn      = f.last_tick_turn,
            AccruedProduction = f.accrued_production,
            AccruedInput      = f.accrued_input,
            Flags             = f.flags,
            RecipeCycleRemaining = f.recipe_cycle_remaining,
            Slot0Id = f.slot0_id, Slot0Count = f.slot0_count,
            Slot1Id = f.slot1_id, Slot1Count = f.slot1_count,
            Slot2Id = f.slot2_id, Slot2Count = f.slot2_count,
            Slot3Id = f.slot3_id, Slot3Count = f.slot3_count,
            AttackDamage    = f.attack_damage,
            AttackRange     = f.attack_range,
            AttackCooldown  = f.attack_cooldown,
            TimeSinceAttack = f.time_since_attack,
            AttackKind      = f.attack_kind,
            TargetMode      = f.target_mode,
        };

        /// <summary>Snapshots the per-type ledger buffer (CapitalLedger / FarmLedger / …) into the record's 4 inline slots. All ledger buffers share the BankLedgerBase binary layout so the read is uniform after the type dispatch picks the right buffer. Truncates past 4 unique items — acceptable loss for offline state. Used by both chunk-unload snapshot in <see cref="HexChunkSystem"/> and the live-loaded snapshot in <see cref="RustPersistenceFlushSystem"/>.</summary>
        public static void SnapshotLedgerSlots(EntityManager em, Entity entity, byte type, ref UnloadedBuildingRecord rec)
        {
            switch (type)
            {
                case BuildingType.Capital:    if (em.HasBuffer<CapitalLedger>(entity))    CopyLedgerSlots(em.GetBuffer<CapitalLedger>(entity).Reinterpret<BankLedgerBase>(), ref rec); break;
                case BuildingType.Farm:       if (em.HasBuffer<FarmLedger>(entity))       CopyLedgerSlots(em.GetBuffer<FarmLedger>(entity).Reinterpret<BankLedgerBase>(), ref rec); break;
                case BuildingType.Barracks:   if (em.HasBuffer<BarracksLedger>(entity))   CopyLedgerSlots(em.GetBuffer<BarracksLedger>(entity).Reinterpret<BankLedgerBase>(), ref rec); break;
                case BuildingType.Furnace:    if (em.HasBuffer<FurnaceLedger>(entity))    CopyLedgerSlots(em.GetBuffer<FurnaceLedger>(entity).Reinterpret<BankLedgerBase>(), ref rec); break;
                case BuildingType.Inn:        if (em.HasBuffer<InnLedger>(entity))        CopyLedgerSlots(em.GetBuffer<InnLedger>(entity).Reinterpret<BankLedgerBase>(), ref rec); break;
                case BuildingType.Market:     if (em.HasBuffer<MarketLedger>(entity))     CopyLedgerSlots(em.GetBuffer<MarketLedger>(entity).Reinterpret<BankLedgerBase>(), ref rec); break;
                case BuildingType.Outpost:    if (em.HasBuffer<OutpostLedger>(entity))    CopyLedgerSlots(em.GetBuffer<OutpostLedger>(entity).Reinterpret<BankLedgerBase>(), ref rec); break;
                case BuildingType.Lumbercamp: if (em.HasBuffer<LumbercampLedger>(entity)) CopyLedgerSlots(em.GetBuffer<LumbercampLedger>(entity).Reinterpret<BankLedgerBase>(), ref rec); break;
                case BuildingType.MiningPit:  if (em.HasBuffer<MiningPitLedger>(entity))  CopyLedgerSlots(em.GetBuffer<MiningPitLedger>(entity).Reinterpret<BankLedgerBase>(), ref rec); break;
                case BuildingType.GoblinCave: if (em.HasBuffer<GoblinCaveLedger>(entity)) CopyLedgerSlots(em.GetBuffer<GoblinCaveLedger>(entity).Reinterpret<BankLedgerBase>(), ref rec); break;
            }
        }

        /// <summary>Snapshots the per-entity attack loadout into the record's combat slots. Reads <see cref="MeleeAttack"/> / <see cref="RangedAttack"/> / <see cref="SpellCast"/> in priority order — only one wins, mirroring the unit path. No-op for buildings without an attack component (most types). Mana cost from <see cref="SpellCast"/> is dropped — ghost combat is mana-free.</summary>
        public static void SnapshotAttack(EntityManager em, Entity entity, ref UnloadedBuildingRecord rec)
        {
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
        }

        static void CopyLedgerSlots(DynamicBuffer<BankLedgerBase> buf, ref UnloadedBuildingRecord rec)
        {
            int n = buf.Length;
            if (n > 0) { rec.Slot0Id = buf[0].ItemId; rec.Slot0Count = buf[0].Count; }
            if (n > 1) { rec.Slot1Id = buf[1].ItemId; rec.Slot1Count = buf[1].Count; }
            if (n > 2) { rec.Slot2Id = buf[2].ItemId; rec.Slot2Count = buf[2].Count; }
            if (n > 3) { rec.Slot3Id = buf[3].ItemId; rec.Slot3Count = buf[3].Count; }
        }
    }
}
