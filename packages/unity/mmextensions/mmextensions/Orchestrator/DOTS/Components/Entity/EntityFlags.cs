using System;
using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Bitwise flags for entity classification. Entities can have multiple types.
    /// Using uint for 32 possible flags.
    /// </summary>
    [Flags]
    public enum EntityType : uint
    {
        None      = 0,
        
        // Core Types (0-7)
        Resource  = 1 << 0,   // 1
        Structure = 1 << 1,   // 2
        Monster   = 1 << 2,   // 4
        Unit      = 1 << 3,   // 8
        Player    = 1 << 4,   // 16
        NPC       = 1 << 5,   // 32
        Projectile = 1 << 6,  // 64
        Item      = 1 << 7,   // 128
        
        // Allegiance/Faction (8-11)
        Neutral   = 1 << 8,   // 256
        Enemy     = 1 << 9,   // 512
        Ally      = 1 << 10,  // 1024
        Boss      = 1 << 11,  // 2048
        
        // Properties (12-19)
        Interactable = 1 << 12, // 4096
        Destructible = 1 << 13, // 8192
        Collectible  = 1 << 14, // 16384
        Tradeable    = 1 << 15, // 32768
        Upgradeable  = 1 << 16, // 65536
        Stackable    = 1 << 17, // 131072
        Consumable   = 1 << 18, // 262144
        Equippable   = 1 << 19, // 524288
        
        // Special States (20-27)
        Elite        = 1 << 20, // 1048576
        Rare         = 1 << 21, // 2097152
        Epic         = 1 << 22, // 4194304
        Legendary    = 1 << 23, // 8388608
        Quest        = 1 << 24, // 16777216
        Temporary    = 1 << 25, // 33554432
        Persistent   = 1 << 26, // 67108864
        Spawner      = 1 << 27, // 134217728
        
        // Reserved for future (28-31)
        Reserved28   = 1 << 28,
        Reserved29   = 1 << 29,
        Reserved30   = 1 << 30,
        Reserved31   = 1u << 31, // Note: 1u for unsigned literal
    }

    /// <summary>
    /// Action state flags for what the entity is currently doing or can do.
    /// Using uint for 32 possible flags.
    /// </summary>
    [Flags]
    public enum EntityActionFlags : uint
    {
        None          = 0,
        
        // Current State (0-9)
        Idle          = 1 << 0,   // 1
        Moving        = 1 << 1,   // 2
        Attacking     = 1 << 2,   // 4
        Harvesting    = 1 << 3,   // 8
        Building      = 1 << 4,   // 16
        Producing     = 1 << 5,   // 32
        Dead          = 1 << 6,   // 64
        Damaged       = 1 << 7,   // 128
        Healing       = 1 << 8,   // 256
        Stunned       = 1 << 9,   // 512
        
        // Status Effects (10-15)
        Invulnerable  = 1 << 10,  // 1024
        Invisible     = 1 << 11,  // 2048
        Burning       = 1 << 12,  // 4096
        Frozen        = 1 << 13,  // 8192
        Poisoned      = 1 << 14,  // 16384
        Buffed        = 1 << 15,  // 32768
        
        // Capabilities (16-23)
        CanAttack     = 1 << 16,  // 65536
        CanMove       = 1 << 17,  // 131072
        CanInteract   = 1 << 18,  // 262144
        CanHarvest    = 1 << 19,  // 524288
        CanBuild      = 1 << 20,  // 1048576
        CanTrade      = 1 << 21,  // 2097152
        CanCraft      = 1 << 22,  // 4194304
        CanCast       = 1 << 23,  // 8388608
        
        // AI/Behavior States (24-27)
        Aggressive    = 1 << 24,  // 16777216
        Defensive     = 1 << 25,  // 33554432
        Fleeing       = 1 << 26,  // 67108864
        Patrolling    = 1 << 27,  // 134217728
        
        // Reserved (28-31)
        Reserved28    = 1 << 28,
        Reserved29    = 1 << 29,
        Reserved30    = 1 << 30,
        Reserved31    = 1u << 31,
    }

    /// <summary>
    /// Component that identifies entity type and current action state.
    /// Total size: 8 bytes (4 + 4)
    /// </summary>
    public struct EntityTypeComponent : IComponentData
    {
        public EntityType Type;
        public EntityActionFlags ActionFlags;
    }
}