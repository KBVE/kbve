using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Fires once per new building entity the frame after it lands in the world. Payload mirrors the minimal identity of the Building component so UI / analytics subscribers don't need to re-query ECS.</summary>
    public readonly struct BuildingSpawnedMessage
    {
        public readonly Entity Entity;
        public readonly byte   Type;
        public readonly int2   RootHex;
        public readonly byte   OwnerFaction;
        public BuildingSpawnedMessage(Entity e, byte t, int2 hex, byte faction)
        {
            Entity = e; Type = t; RootHex = hex; OwnerFaction = faction;
        }
    }

    /// <summary>Fires when a ConstructionSite building has its materials fully delivered and transitions to the operational state. Consumers: achievement unlock, toast notification, SFX.</summary>
    public readonly struct BuildingConstructionCompleteMessage
    {
        public readonly Entity Entity;
        public readonly byte   Type;
        public readonly int2   RootHex;
        public readonly byte   OwnerFaction;
        public BuildingConstructionCompleteMessage(Entity e, byte t, int2 hex, byte faction)
        {
            Entity = e; Type = t; RootHex = hex; OwnerFaction = faction;
        }
    }

    /// <summary>Fires when BuildingTier.Value advances (Market→Trade House→Merchants Guild, Farm→Village, Barracks→Keep→Castle). NewTier is the value after the bump.</summary>
    public readonly struct BuildingTierChangedMessage
    {
        public readonly Entity Entity;
        public readonly byte   Type;
        public readonly byte   NewTier;
        public BuildingTierChangedMessage(Entity e, byte t, byte tier)
        {
            Entity = e; Type = t; NewTier = tier;
        }
    }

    /// <summary>Fires when BuildingHealth.Value decreases. Delta is always positive (damage taken).</summary>
    public readonly struct BuildingDamagedMessage
    {
        public readonly Entity Entity;
        public readonly int    Damage;
        public readonly ushort HealthAfter;
        public BuildingDamagedMessage(Entity e, int damage, ushort after)
        {
            Entity = e; Damage = damage; HealthAfter = after;
        }
    }

    /// <summary>Fires when BuildingHealth.Value increases. Delta is always positive (HP restored).</summary>
    public readonly struct BuildingRepairedMessage
    {
        public readonly Entity Entity;
        public readonly int    HealAmount;
        public readonly ushort HealthAfter;
        public BuildingRepairedMessage(Entity e, int healAmount, ushort after)
        {
            Entity = e; HealAmount = healAmount; HealthAfter = after;
        }
    }

    /// <summary>Fires right before the entity is destroyed via combat / HP depletion. Distinct from <see cref="BuildingDemolishedMessage"/> (player-initiated teardown).</summary>
    public readonly struct BuildingDestroyedMessage
    {
        public readonly Entity Entity;
        public readonly byte   Type;
        public readonly int2   RootHex;
        public readonly byte   OwnerFaction;
        public BuildingDestroyedMessage(Entity e, byte t, int2 hex, byte faction)
        {
            Entity = e; Type = t; RootHex = hex; OwnerFaction = faction;
        }
    }

    /// <summary>Fires when the player intentionally tears a building down via <c>DemolishRequest</c>. Useful for refund UI, analytics.</summary>
    public readonly struct BuildingDemolishedMessage
    {
        public readonly Entity Entity;
        public readonly byte   Type;
        public readonly int2   RootHex;
        public BuildingDemolishedMessage(Entity e, byte t, int2 hex)
        {
            Entity = e; Type = t; RootHex = hex;
        }
    }
}
