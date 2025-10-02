using NSprites;
using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;
using KBVE.MMExtensions.Orchestrator.DOTS;

/// DOTS v2 - PREPARING

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{

    [BurstCompile]
    public partial struct SpawnNewHordesSystem : ISystem
    {
        private struct SystemData : IComponentData
        {
            public EntityQuery MinionRequireQuery;
            public EntityArchetype HordeArchetype;
            public Random Rand;
        }

        public void OnCreate(ref SystemState state)
        {
            var systemData = new SystemData
            {
                MinionRequireQuery = state.GetEntityQuery(typeof(RequireMinion)),
                HordeArchetype = state.EntityManager.CreateArchetype
                (
                    typeof(MinionLink),
                    typeof(RequireMinion),
                    typeof(HordeSettings),
                    typeof(WorldPosition2D),
                    typeof(PrevWorldPosition2D)
                ),
                Rand = new Random(1u)
            };
            _ = state.EntityManager.AddComponentData(state.SystemHandle, systemData);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var systemData = SystemAPI.GetComponent<SystemData>(state.SystemHandle);
            if (systemData.MinionRequireQuery.CalculateChunkCount() != 0
                || !SystemAPI.TryGetSingleton<MapSettings>(out var mapSettings)
                || !SystemAPI.TryGetSingleton<HordeDefaultSettings>(out var hordeDefaultSettings))
                return;

            var pos = systemData.Rand.NextFloat2(mapSettings.size.c0, mapSettings.size.c1);
            var resolution = systemData.Rand.NextInt2(new int2(5), new int2(20));
            var minionCount = resolution.x * resolution.y;

            var hordeEntity = state.EntityManager.CreateEntity(systemData.HordeArchetype);
            state.EntityManager.GetBuffer<MinionLink>(hordeEntity).EnsureCapacity(minionCount);
            state.EntityManager.SetComponentData(hordeEntity, new HordeSettings
            {
                hordeResolution = resolution,
                minionMargin = hordeDefaultSettings.defaultSettings.minionMargin
            });
            state.EntityManager.SetComponentData(hordeEntity, new RequireMinion { count = minionCount });
            state.EntityManager.SetComponentData(hordeEntity, new WorldPosition2D { Value = pos });
            state.EntityManager.SetComponentData(hordeEntity, new PrevWorldPosition2D { value = pos });

            SystemAPI.SetComponent(state.SystemHandle, systemData);
        }
    }
}