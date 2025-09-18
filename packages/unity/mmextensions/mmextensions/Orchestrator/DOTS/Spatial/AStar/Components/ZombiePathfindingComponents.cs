using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Spatial.AStar
{
    /// <summary>
    /// Component for zombie-specific navigation behavior
    /// Tracks target entities and manages zombie AI state
    /// </summary>
    public struct ZombieNavigation : IComponentData
    {
        /// <summary>Entity the zombie is currently targeting (usually player)</summary>
        public Entity targetEntity;

        /// <summary>Last known position of the target</summary>
        public float3 lastKnownTargetPos;

        /// <summary>How far the zombie can detect targets</summary>
        public float targetScanRadius;

        /// <summary>How often to update target (in seconds)</summary>
        public float targetUpdateInterval;

        /// <summary>Time when target was last updated</summary>
        public float lastTargetUpdate;

        /// <summary>Whether the zombie currently has a valid target</summary>
        public bool hasTarget;

        /// <summary>Whether the zombie should actively search for targets</summary>
        public bool isActivelySearching;

        /// <summary>Minimum distance to maintain from target</summary>
        public float minTargetDistance;

        public static ZombieNavigation CreateDefault(float scanRadius = 15f)
        {
            return new ZombieNavigation
            {
                targetEntity = Entity.Null,
                lastKnownTargetPos = float3.zero,
                targetScanRadius = scanRadius,
                targetUpdateInterval = 1f, // Update target every second
                lastTargetUpdate = 0f,
                hasTarget = false,
                isActivelySearching = true,
                minTargetDistance = 1.5f
            };
        }
    }

    /// <summary>
    /// Configuration component for zombie pathfinding behavior
    /// Contains tunable parameters for different zombie types
    /// </summary>
    public struct ZombiePathfindingConfig : IComponentData
    {
        /// <summary>Base movement speed</summary>
        public float moveSpeed;

        /// <summary>Distance to stop from target</summary>
        public float stoppingDistance;

        /// <summary>How often to recalculate path (in seconds)</summary>
        public float pathUpdateInterval;

        /// <summary>Whether to use RVO collision avoidance</summary>
        public bool enableRVO;

        /// <summary>How aggressively to pursue targets (0-1)</summary>
        public float aggressionLevel;

        /// <summary>Whether zombie can lose target if out of range</summary>
        public bool canLoseTarget;

        /// <summary>Time to remember last target position when lost</summary>
        public float targetMemoryTime;

        public static ZombiePathfindingConfig CreateDefault(MinionType type)
        {
            return type switch
            {
                MinionType.Tank => new ZombiePathfindingConfig // Zombie uses Tank type
                {
                    moveSpeed = 2f,
                    stoppingDistance = 1.5f,
                    pathUpdateInterval = 1f,
                    enableRVO = true,
                    aggressionLevel = 0.8f,
                    canLoseTarget = true,
                    targetMemoryTime = 3f
                },
                MinionType.Fast => new ZombiePathfindingConfig
                {
                    moveSpeed = 5f,
                    stoppingDistance = 1f,
                    pathUpdateInterval = 0.5f,
                    enableRVO = true,
                    aggressionLevel = 1f,
                    canLoseTarget = false,
                    targetMemoryTime = 5f
                },
                _ => new ZombiePathfindingConfig
                {
                    moveSpeed = 3f,
                    stoppingDistance = 2f,
                    pathUpdateInterval = 1f,
                    enableRVO = true,
                    aggressionLevel = 0.5f,
                    canLoseTarget = true,
                    targetMemoryTime = 2f
                }
            };
        }
    }

    /// <summary>
    /// Tag component to mark entities as valid targets for zombies
    /// Add this to player entities or other targets
    /// </summary>
    public struct ZombieTarget : IComponentData
    {
        /// <summary>Priority of this target (higher = more attractive)</summary>
        public float priority;

        /// <summary>Whether this target can be detected by zombies</summary>
        public bool isDetectable;

        /// <summary>Faction of this target</summary>
        public FactionType faction;

        public static ZombieTarget CreatePlayer(float priority = 1f)
        {
            return new ZombieTarget
            {
                priority = priority,
                isDetectable = true,
                faction = FactionType.Player
            };
        }
    }

    /// <summary>
    /// Component to track zombie pathfinding state and performance
    /// Useful for debugging and optimization
    /// </summary>
    public struct ZombiePathfindingState : IComponentData
    {
        /// <summary>Current pathfinding state</summary>
        public PathfindingState state;

        /// <summary>Time when last path was calculated</summary>
        public float lastPathCalculation;

        /// <summary>Time when destination was last updated</summary>
        public float lastDestinationUpdate;

        /// <summary>Number of path calculation failures</summary>
        public int pathFailures;

        /// <summary>Distance to current destination</summary>
        public float distanceToDestination;

        /// <summary>Whether zombie is currently moving</summary>
        public bool isMoving;

        public enum PathfindingState : byte
        {
            Idle = 0,
            SearchingForTarget = 1,
            CalculatingPath = 2,
            FollowingPath = 3,
            ReachedDestination = 4,
            PathBlocked = 5,
            TargetLost = 6
        }
    }
}