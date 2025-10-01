using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Core minion data component for ECS entities
    /// Optimized for bulk spawning and processing
    /// </summary>
    public struct MinionData : IComponentData
    {
        public float Health;
        public float MaxHealth;
        public float Speed;
        public float AttackDamage;
        public float AttackRange;
        public float DetectionRange;

        // Faction system matching existing NPCData
        public FactionType Faction;
        public MinionType Type;
        public int Level;

        // State flags packed into single int for efficiency
        public MinionStateFlags StateFlags;

        // Unique instance identifier to differentiate spawned entities
        public int InstanceID;

        public bool IsAlive => Health > 0;
        public float HealthPercentage => Health / MaxHealth;
    }

    /// <summary>
    /// Type of minion for behavior selection
    /// </summary>
    public enum MinionType : byte
    {
        Basic = 0,
        Fast = 1,
        Tank = 2,
        Ranged = 3,
        Flying = 4,
        Boss = 5
    }

    /// <summary>
    /// State flags for efficient state management
    /// </summary>
    [System.Flags]
    public enum MinionStateFlags : int
    {
        None = 0,
        Moving = 1 << 0,
        Attacking = 1 << 1,
        Stunned = 1 << 2,
        Invulnerable = 1 << 3,
        Invisible = 1 << 4,
        Aggro = 1 << 5,
        Fleeing = 1 << 6,
        Dead = 1 << 7,
        Rooted = 1 << 8,
        Defending = 1 << 9,
        Spawning = 1 << 10,
        Despawning = 1 << 11,
        Enraged = 1 << 12,
        Charging = 1 << 13
    }
}