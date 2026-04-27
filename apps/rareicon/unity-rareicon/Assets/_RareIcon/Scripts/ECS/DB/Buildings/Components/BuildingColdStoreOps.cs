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
        };
    }
}
