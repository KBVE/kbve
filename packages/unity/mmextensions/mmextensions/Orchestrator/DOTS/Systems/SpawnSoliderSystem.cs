using Unity.Burst;
using Unity.Entities;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    [BurstCompile]
    public partial struct SpawnSoliderSystem : ISystem
    {
        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!Input.GetKey(KeyCode.A))
                return;

            if (!SystemAPI.TryGetSingleton<SquadDefaultSettings>(out var squadSettings))
                return;

            // Use BeginSimulation ECB instead of EndSimulation to avoid blocking
            // Spawn will occur at the start of next frame, spreading the cost
            _ = SystemAPI.GetSingleton<BeginSimulationEntityCommandBufferSystem.Singleton>().CreateCommandBuffer(state.WorldUnmanaged).Instantiate(squadSettings.soldierPrefab);
        }
    }
}