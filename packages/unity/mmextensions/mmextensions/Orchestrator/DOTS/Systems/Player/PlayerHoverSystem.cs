using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Physics;
using Unity.Physics.Systems;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Minimal cache to prevent jitter without sacrificing speed.
    /// </summary>
    public struct PlayerHoverCache : IComponentData
    {
        public Entity LastHitEntity;
        public float3 LastRayOrigin;
        public float3 LastRayDir;
    }

    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct PlayerHoverSystem : ISystem
    {
        private Entity _hoverEntity;
        private Entity _cacheEntity;
        private CollisionFilter _filter;

        // PERFORMANCE: Throttle raycast updates for 50k+ entities
        // Hover detection doesn't need to be 60fps - 15Hz is imperceptible
        private const int UPDATE_FREQUENCY = 4; // 1=every frame (60fps), 4=every 4th frame (15fps)
        private ulong _frameCounter;

        // Tolerance for "ray hasn't moved" check
        private const float RAY_EPSILON = 0.0001f;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<PlayerPointerRay>();
            var em = state.EntityManager;
            _hoverEntity = em.CreateEntity(typeof(PlayerHover));
            em.SetName(_hoverEntity, "PlayerHoverSingleton");
            _cacheEntity = em.CreateEntity(typeof(PlayerHoverCache));
            em.SetName(_cacheEntity, "PlayerHoverCache");
            // Customize for your layers
            _filter = CollisionFilter.Default;
            // Example: _filter = new CollisionFilter {
            //     BelongsTo = ~0u,
            //     CollidesWith = 1u << YOUR_LAYER,
            //     GroupIndex = 0
            // };
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            // PERFORMANCE: Throttle updates - physics raycasts are expensive at 50k+ entities
            // At 50k entities with physics at 10Hz, raycasts can be expensive even with caching
            _frameCounter++;
            if (UPDATE_FREQUENCY > 1 && _frameCounter % UPDATE_FREQUENCY != 0)
            {
                return; // Skip this frame - hover updates at 15Hz instead of 60Hz
            }

            var ray = SystemAPI.GetSingleton<PlayerPointerRay>();
            var cache = SystemAPI.GetSingleton<PlayerHoverCache>();

            if (math.distancesq(ray.Origin, cache.LastRayOrigin) < RAY_EPSILON &&
                math.distancesq(ray.Direction, cache.LastRayDir) < RAY_EPSILON)
            {
                return;
            }

            var physicsWorld = SystemAPI.GetSingleton<PhysicsWorldSingleton>().PhysicsWorld;

            var input = new RaycastInput
            {
                Start = ray.Origin,
                End = ray.Origin + ray.Direction * ray.MaxDistance,
                Filter = _filter
            };

            var hitEntity = physicsWorld.CastRay(input, out var hit)
                ? physicsWorld.Bodies[hit.RigidBodyIndex].Entity
                : Entity.Null;

            // Always update the hover component to allow re-hovering same entities
            var hoverLookup = SystemAPI.GetComponentLookup<PlayerHover>(false);
            hoverLookup[_hoverEntity] = new PlayerHover { Entity = hitEntity };
            cache.LastHitEntity = hitEntity;

            cache.LastRayOrigin = ray.Origin;
            cache.LastRayDir = ray.Direction;
            SystemAPI.SetSingleton(cache);
        }
    }
}