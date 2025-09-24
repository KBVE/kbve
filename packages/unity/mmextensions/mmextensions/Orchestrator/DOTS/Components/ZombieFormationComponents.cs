using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Component that enables zombies to participate in formation patterns
    /// Used for coordinated movement like spelling out letters
    /// </summary>
    public struct ZombieFormationMember : IComponentData
    {
        /// <summary>Formation index for this zombie (determines position in formation)</summary>
        public int formationIndex;

        /// <summary>Whether this zombie should participate in formations</summary>
        public bool isActive;

        /// <summary>Current formation this zombie is assigned to</summary>
        public FormationID currentFormation;

        /// <summary>Priority in formation (higher = more important positioning)</summary>
        public float priority;

        public static ZombieFormationMember CreateDefault(int index)
        {
            return new ZombieFormationMember
            {
                formationIndex = index,
                isActive = true,
                currentFormation = FormationID.Letters,
                priority = 1f
            };
        }
    }

    /// <summary>
    /// Global formation controller component
    /// Add this to a singleton entity to control all formation behavior
    /// </summary>
    public struct ZombieFormationController : IComponentData
    {
        /// <summary>Current active formation</summary>
        public FormationID activeFormation;

        /// <summary>Current letter being spelled (0=K, 1=B, 2=V, 3=E)</summary>
        public int currentLetter;

        /// <summary>Time spent on current letter</summary>
        public float letterTimer;

        /// <summary>Duration to spend on each letter</summary>
        public float letterDuration;

        /// <summary>Center position of formations in world space</summary>
        public float3 formationCenter;

        /// <summary>Scale factor for formation size</summary>
        public float formationScale;

        /// <summary>Whether formations are currently active</summary>
        public bool isFormationActive;

        /// <summary>Smoothing factor for formation transitions</summary>
        public float transitionSpeed;

        public static ZombieFormationController CreateDefault()
        {
            return new ZombieFormationController
            {
                activeFormation = FormationID.Letters,
                currentLetter = 0,
                letterTimer = 0f,
                letterDuration = 15f, // Medium duration for formation
                formationCenter = new float3(0, 0, 1),
                formationScale = 150f, // Very large scale for loose formations
                isFormationActive = true,
                transitionSpeed = 1f
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
    /// Available formation types
    /// </summary>
    public enum FormationID : byte
    {
        None = 0,
        Letters = 1,        // K, B, V, E sequence
        Circle = 2,         // Circular formation
        Line = 3,           // Line formation
        Grid = 4,           // Grid pattern
        Spiral = 5,         // Spiral pattern
        Custom = 255        // Custom formation pattern
    }

    /// <summary>
    /// Formation transition states
    /// </summary>
    public enum FormationState : byte
    {
        Idle = 0,
        Forming = 1,
        Holding = 2,
        Transitioning = 3,
        Dispersing = 4
    }
}