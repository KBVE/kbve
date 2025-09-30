using Unity.Entities;
using Unity.Mathematics;
using System.Runtime.InteropServices;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Tag to identify formation/horde entities (replaces ZombieHordeTag)
    /// A formation with type != None is considered active
    /// </summary>
    public struct ZombieFormationEntity : IComponentData
    {
        public HordeFormationType formationType;
    }

    /// <summary>
    /// Link from formation to individual zombies (replaces ZombieLink from ZombieHordeComponents)
    /// </summary>
    public struct FormationMemberLink : IBufferElementData
    {
        public Entity zombie;
    }

    /// <summary>
    /// Component that enables zombies to participate in formations
    /// Used for squad-like coordinated movement and positioning
    /// </summary>
    public struct ZombieFormationMember : IComponentData
    {
        /// <summary>Index within the formation (determines position in formation)</summary>
        public int formationIndex;

        /// <summary>Entity representing the formation this zombie belongs to</summary>
        public Entity formationEntity;

        /// <summary>Whether this zombie should participate in formations</summary>
        [MarshalAs(UnmanagedType.U1)]
        public bool isActive;

        public static ZombieFormationMember CreateDefault(int index)
        {
            return new ZombieFormationMember
            {
                formationIndex = index,
                formationEntity = Entity.Null,
                isActive = true
            };
        }
    }

    // Keep old name as alias for backward compatibility during migration
    [System.Obsolete("Use ZombieFormationMember instead")]
    public struct ZombieHordeMember : IComponentData
    {
        public int hordeIndex;
        public Entity hordeEntity;
        [MarshalAs(UnmanagedType.U1)]
        public bool isActive;

        public static ZombieHordeMember CreateDefault(int index)
        {
            return new ZombieHordeMember
            {
                hordeIndex = index,
                hordeEntity = Entity.Null,
                isActive = true
            };
        }
    }

    /// <summary>
    /// Settings for zombie formations - like squad settings in Age of Sprites
    /// </summary>
    public struct ZombieFormationSettings : IComponentData
    {
        /// <summary>Spacing between zombies in formation</summary>
        public float2 zombieSpacing;

        /// <summary>Formation grid size (width x height)</summary>
        public int2 formationSize;

        /// <summary>Type of formation pattern</summary>
        public HordeFormationType formationType;

        public static ZombieFormationSettings CreateDefault(HordeFormationType type = HordeFormationType.Grid)
        {
            return new ZombieFormationSettings
            {
                zombieSpacing = new float2(2f, 2f), // 2 unit spacing between zombies
                formationSize = new int2(10, 10),   // 10x10 grid formation
                formationType = type
            };
        }
    }

    /// <summary>
    /// Component for formation center position and movement
    /// </summary>
    public struct ZombieFormationCenter : IComponentData
    {
        /// <summary>Current center position of the horde</summary>
        public float3 position;

        /// <summary>Target position the horde is moving towards</summary>
        public float3 targetPosition;

        /// <summary>Original spawn position for patrol movement</summary>
        public float3 spawnPosition;

        /// <summary>Movement speed of the horde</summary>
        public float moveSpeed;

        public static ZombieFormationCenter CreateDefault(float3 startPos)
        {
            return new ZombieFormationCenter
            {
                position = startPos,
                targetPosition = startPos,
                spawnPosition = startPos,
                moveSpeed = 1.5f // Slightly slower than individual zombies
            };
        }
    }

    /// <summary>
    /// Component to track formation statistics and performance
    /// Useful for debugging large-scale formations
    /// </summary>
    public struct ZombieFormationStats : IComponentData
    {
        /// <summary>Total zombies in formation</summary>
        public int totalZombies;

        /// <summary>Zombies currently in correct position</summary>
        public int zombiesInPosition;

        /// <summary>Average distance from target positions</summary>
        public float averageDistanceToTarget;

        /// <summary>Formation completion percentage (0-1)</summary>
        public float formationCompleteness;

        /// <summary>Time formation has been active</summary>
        public float formationActiveTime;

        /// <summary>Number of formation changes</summary>
        public int formationChangeCount;
    }

    /// <summary>
    /// Available horde formation types - practical formations for gameplay
    /// </summary>
    public enum HordeFormationType : byte
    {
        None = 0,
        Grid = 1,           // Rectangular grid formation (default horde behavior)
        Wedge = 2,          // V-shaped wedge formation
        Line = 3,           // Single line formation
        Column = 4,         // Column formation
        Circle = 5,         // Circular formation
        Blob = 6            // Loose blob/cluster formation
    }

    // Backward compatibility aliases (from old ZombieHordeComponents.cs)
    [System.Obsolete("Use ZombieFormationEntity instead")]
    public struct ZombieHordeTag : IComponentData { }

    [System.Obsolete("Use FormationMemberLink instead")]
    public struct ZombieLink : IBufferElementData
    {
        public Entity zombie;
    }

    [System.Obsolete("Use ZombieFormationCenter.targetPosition instead")]
    public struct ZombieHordeTarget : IComponentData
    {
        public float2 position;
    }

    [System.Obsolete("Use ZombieFormationSettings instead")]
    public struct ZombieHordeSettings : IComponentData
    {
        public float2 zombieSpacing;
        public int2 formationSize;
        public HordeFormationType formationType;
    }

    [System.Obsolete("Use ZombieFormationCenter instead")]
    public struct ZombieHordeCenter : IComponentData
    {
        public float3 position;
        public float3 targetPosition;
        public float3 spawnPosition;
        public float moveSpeed;
    }
}