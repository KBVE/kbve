using NSprites;
using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    [WorldSystemFilter(WorldSystemFilterFlags.Default)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [BurstCompile]
    public partial struct SquadSpawnSystem : ISystem
    {
        private struct SystemData : IComponentData
        {
            public EntityArchetype SquadArchetype;
        }

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<SquadDefaultSettings>();
            state.RequireForUpdate<BeginSimulationEntityCommandBufferSystem.Singleton>();

            var typeArray = new NativeArray<ComponentType>(4, Allocator.Temp);
            typeArray[0] = ComponentType.ReadOnly<WorldPosition2D>();
            typeArray[1] = ComponentType.ReadOnly<PrevWorldPosition2D>();
            typeArray[2] = ComponentType.ReadOnly<SoldierLink>();
            typeArray[3] = ComponentType.ReadOnly<RequireSoldier>();

            var systemData = new SystemData { SquadArchetype = state.EntityManager.CreateArchetype(typeArray) };

            _ = state.EntityManager.AddComponentData(state.SystemHandle, systemData);

            typeArray.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!Input.GetKeyDown(KeyCode.S))
                return;

            var systemData = SystemAPI.GetComponent<SystemData>(state.SystemHandle);

            // Use BeginSimulation ECB to avoid blocking - squad spawns at start of next frame
            var ecb = SystemAPI.GetSingleton<BeginSimulationEntityCommandBufferSystem.Singleton>().CreateCommandBuffer(state.WorldUnmanaged);
            var squadSettings = SystemAPI.GetSingleton<SquadDefaultSettings>();
            var soldierCount = squadSettings.SoldierCount;

            var squadEntity = ecb.CreateEntity(systemData.SquadArchetype);
            ecb.SetComponent(squadEntity, new RequireSoldier { count = soldierCount });
        }
    }
}