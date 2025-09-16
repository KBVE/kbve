using Unity.Entities;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.Orchestrator.DOTS.Spatial;
using KBVE.MMExtensions.Orchestrator.Core;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Hybrid
{
    /// <summary>
    /// VContainer configuration for DOTS minion systems
    /// Integrates with existing Orchestrator systems
    /// </summary>
    public class MinionWorldLifetimeScope : LifetimeScope
    {
        [SerializeField] private bool useDefaultWorld = true;
        [SerializeField] private bool enableSpatialSystems = true;
        [SerializeField] private bool enableDebugSystems = false;

        protected override void Configure(IContainerBuilder builder)
        {
            // Register the DOTS bridge
            builder.Register<DOTSNPCBridge>(Lifetime.Singleton)
                .AsImplementedInterfaces()
                .AsSelf();

            // Configure ECS world
            if (useDefaultWorld)
            {
                ConfigureDefaultWorld(builder);
            }
            else
            {
                ConfigureCustomWorld(builder);
            }

            Debug.Log("[MinionWorldLifetimeScope] DOTS minion systems configured");
        }

        private void ConfigureDefaultWorld(IContainerBuilder builder)
        {
            // Use the default Unity ECS world
            builder.RegisterBuildCallback(container =>
            {
                var world = World.DefaultGameObjectInjectionWorld;
                if (world == null)
                {
                    Debug.LogError("[MinionWorldLifetimeScope] Default world not found");
                    return;
                }

                // Create and register systems
                RegisterSystems(world);
            });
        }

        private void ConfigureCustomWorld(IContainerBuilder builder)
        {
            // Create a custom world for minions
            builder.RegisterBuildCallback(container =>
            {
                var world = new World("Minion World");
                World.DefaultGameObjectInjectionWorld = world;

                // Create system groups
                var initGroup = world.GetOrCreateSystemManaged<InitializationSystemGroup>();
                var simGroup = world.GetOrCreateSystemManaged<SimulationSystemGroup>();
                var presentGroup = world.GetOrCreateSystemManaged<PresentationSystemGroup>();

                // Register systems
                RegisterSystems(world);

                // Start world update
                ScriptBehaviourUpdateOrder.AppendWorldToCurrentPlayerLoop(world);
            });
        }

        private void RegisterSystems(World world)
        {
            var simGroup = world.GetOrCreateSystemManaged<SimulationSystemGroup>();

            // Core minion systems
            var spawningSystem = world.CreateSystemManaged<MinionSpawningSystem>();
            var spawnRequestSystem = world.CreateSystemManaged<MinionSpawnRequestSystem>();
            simGroup.AddSystemToUpdateList(spawningSystem);
            simGroup.AddSystemToUpdateList(spawnRequestSystem);

            // Movement system
            var movementSystem = world.CreateSystemManaged<MinionMovementSystem>();
            simGroup.AddSystemToUpdateList(movementSystem);

            // Behavior system
            var behaviorSystem = world.CreateSystemManaged<MinionBehaviorSystem>();
            simGroup.AddSystemToUpdateList(behaviorSystem);

            // Spatial systems
            if (enableSpatialSystems)
            {
                var spatialIndexSystem = world.CreateSystemManaged<SpatialIndexingSystem>();
                var spatialQuerySystem = world.CreateSystemManaged<SpatialQuerySystem>();
                simGroup.AddSystemToUpdateList(spatialIndexSystem);
                simGroup.AddSystemToUpdateList(spatialQuerySystem);
            }

            // Debug systems
            if (enableDebugSystems)
            {
                var debugSystem = world.CreateSystemManaged<MinionDebugSystem>();
                simGroup.AddSystemToUpdateList(debugSystem);
            }

            Debug.Log($"[MinionWorldLifetimeScope] Registered systems in {world.Name}");
        }

        private void OnDestroy()
        {
            // Clean up custom world if created
            if (!useDefaultWorld)
            {
                var world = World.DefaultGameObjectInjectionWorld;
                if (world != null && world.Name == "Minion World")
                {
                    world.Dispose();
                    Debug.Log("[MinionWorldLifetimeScope] Minion world disposed");
                }
            }
        }
    }

    /// <summary>
    /// Extension methods for NPCSystemManager to use DOTS
    /// </summary>
    public static class NPCSystemManagerDOTSExtensions
    {
        private static DOTSNPCBridge _dotsBridge;

        public static void InitializeDOTS(this NPCSystemManager manager, DOTSNPCBridge bridge)
        {
            _dotsBridge = bridge;
            Debug.Log("[NPCSystemManagerExtensions] DOTS bridge connected to NPCSystemManager");
        }

        /// <summary>
        /// Spawn a wave of minions using DOTS
        /// </summary>
        public static Entity SpawnMinionWaveECS(this NPCSystemManager manager,
            Vector3 center, int count, float radius = 10f)
        {
            if (_dotsBridge == null)
            {
                Debug.LogError("DOTS bridge not initialized");
                return Entity.Null;
            }

            return _dotsBridge.SpawnMinionWave(center, count, radius);
        }

        /// <summary>
        /// Query nearby minions using DOTS spatial systems
        /// </summary>
        public static int GetNearbyMinionCount(this NPCSystemManager manager,
            Vector3 position, float radius)
        {
            if (_dotsBridge == null) return 0;

            var mobs = _dotsBridge.QueryMobsInRadius(position, radius);
            return mobs.Count;
        }

        /// <summary>
        /// Get statistics about DOTS minions
        /// </summary>
        public static MinionStatistics GetMinionStatistics(this NPCSystemManager manager)
        {
            if (_dotsBridge == null) return new MinionStatistics(true);

            return _dotsBridge.GetStatistics();
        }
    }
}