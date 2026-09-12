using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Edge-triggered — a hostile entity was not in the scan last frame and is in the scan this frame. <see cref="CombatThreatScanSystem"/> emits one per new arrival. Consumers (dialogue first-contact, ambient-audio stingers, future AI alertness) read the ReadBuffer each tick.</summary>
    public struct ThreatDetectedRecord
    {
        public Entity Entity;
        public byte   UnitType;
        public int2   Hex;
        public bool   InsideFriendlyTerritory;
    }

    /// <summary>Edge-triggered — a hostile entity was in the scan last frame and is no longer in the scan this frame (died, retreated, or left the query archetype). <see cref="CombatThreatScanSystem"/> emits one per disappearance.</summary>
    public struct ThreatClearedRecord
    {
        public Entity Entity;
        public byte   UnitType;
        public int2   LastHex;
    }

    /// <summary>One per unit death this frame. <see cref="CombatDeathHookSystem"/> emits from <see cref="CleanupSystemGroup"/> before <see cref="DeathCleanupSystem"/> destroys the entity, so consumers see a valid Entity handle for the one frame the record is in the ReadBuffer.</summary>
    public struct UnitKilledRecord
    {
        public Entity Entity;
        public byte   UnitType;
        public byte   Faction;
        public int2   Hex;
    }

    /// <summary>One per building destruction this frame. <see cref="CombatBuildingDeathHookSystem"/> emits from <see cref="CleanupSystemGroup"/> before <see cref="BuildingDeathSystem"/> destroys the entity. The same-frame destroy prevents duplicate emissions next tick, so no edge-detection set is required here.</summary>
    public struct BuildingDestroyedRecord
    {
        public Entity Entity;
        public byte   BuildingType;
        public byte   Faction;
        public int2   RootHex;
    }
}
