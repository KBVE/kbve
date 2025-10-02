using Unity.Burst;
using Unity.Entities;
using UnityEngine;
using KBVE.MMExtensions.Orchestrator.DOTS;

/// DOTS v2 - PREPARING

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    [BurstCompile]
    public partial struct SpawnMinionSystem : ISystem
    {
        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!Input.GetKey(KeyCode.A))
                return;

            if (!SystemAPI.TryGetSingleton<HordeDefaultSettings>(out var hordeSettings))
                return;

            _ = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>().CreateCommandBuffer(state.WorldUnmanaged).Instantiate(hordeSettings.minionPrefab);
        }
    }
}