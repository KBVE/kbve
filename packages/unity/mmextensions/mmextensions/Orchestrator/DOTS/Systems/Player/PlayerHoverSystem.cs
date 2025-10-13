using Unity.Entities;
using Unity.Physics;
using Unity.Physics.Systems;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildPhysicsWorld))]
    public partial struct PlayerHoverSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<PlayerPointerRay>(out var rayData))
                return;

            var physicsWorld = SystemAPI.GetSingleton<PhysicsWorldSingleton>().PhysicsWorld;

            var input = new RaycastInput
            {
                Start  = rayData.Origin,
                End    = rayData.Origin + rayData.Direction * rayData.MaxDistance,
                Filter = CollisionFilter.Default // TODO: customize for your layers if desired
            };

            if (!SystemAPI.TryGetSingletonEntity<PlayerHover>(out var hoverSingleton))
            {
                hoverSingleton = state.EntityManager.CreateEntity(typeof(PlayerHover));
                state.EntityManager.SetName(hoverSingleton, "PlayerHoverSingleton");
                state.EntityManager.SetComponentData(hoverSingleton, new PlayerHover { Entity = Entity.Null });
            }

            if (physicsWorld.CastRay(input, out var hit))
            {
                var hitEntity = physicsWorld.Bodies[hit.RigidBodyIndex].Entity;
                state.EntityManager.SetComponentData(hoverSingleton, new PlayerHover { Entity = hitEntity });
            }
            else
            {
                state.EntityManager.SetComponentData(hoverSingleton, new PlayerHover { Entity = Entity.Null });
            }
        }
    }
}