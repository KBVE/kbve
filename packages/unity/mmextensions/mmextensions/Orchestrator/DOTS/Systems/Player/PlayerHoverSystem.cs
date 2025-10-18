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