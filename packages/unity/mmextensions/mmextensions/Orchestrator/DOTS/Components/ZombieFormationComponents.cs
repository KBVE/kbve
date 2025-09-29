using Unity.Entities;
using Unity.Mathematics;
using System.Runtime.InteropServices;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Component that enables zombies to participate in horde formations
    /// Used for squad-like coordinated movement and positioning
    /// </summary>
    public struct ZombieHordeMember : IComponentData
    {
        /// <summary>Index within the horde (determines position in formation)</summary>
        public int hordeIndex;

        /// <summary>Entity representing the horde this zombie belongs to</summary>
        public Entity hordeEntity;

        /// <summary>Whether this zombie should participate in horde formations</summary>
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
    /// Settings for zombie horde formations - like squad settings in Age of Sprites
    /// </summary>
    public struct ZombieHordeSettings : IComponentData
    {
        /// <summary>Spacing between zombies in formation</summary>
        public float2 zombieSpacing;

        /// <summary>Formation grid size (width x height)</summary>
        public int2 formationSize;

        /// <summary>Type of formation pattern</summary>
        public HordeFormationType formationType;

        public static ZombieHordeSettings CreateDefault(HordeFormationType type = HordeFormationType.Grid)
        {
            return new ZombieHordeSettings
            {
                zombieSpacing = new float2(2f, 2f), // 2 unit spacing between zombies
                formationSize = new int2(10, 10),   // 10x10 grid formation
                formationType = type
            };
        }
    }

    /// <summary>
    /// Component for horde center position and movement
    /// </summary>
    public struct ZombieHordeCenter : IComponentData
    {
        /// <summary>Current center position of the horde</summary>
        public float3 position;

        /// <summary>Target position the horde is moving towards</summary>
        public float3 targetPosition;

        /// <summary>Original spawn position for patrol movement</summary>
        public float3 spawnPosition;

        /// <summary>Movement speed of the horde</summary>
        public float moveSpeed;

        public static ZombieHordeCenter CreateDefault(float3 startPos)
        {
            return new ZombieHordeCenter
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
        Grid = 1,           // Rectangular grid formation
        Wedge = 2,          // V-shaped wedge formation
        Line = 3,           // Single line formation
        Column = 4,         // Column formation
        Circle = 5,         // Circular formation
        Blob = 6            // Loose blob/cluster formation
    }
}