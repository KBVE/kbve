using Unity.Entities;
using Unity.Burst;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class ZombieAvoidanceInitSystem : SystemBase
    {
        private uint _randomSeed = 1234;

        protected override void OnUpdate()
        {
            // Add LocalAvoidanceData to any zombie that doesn't have it
            var ecb = new EntityCommandBuffer(Unity.Collections.Allocator.Temp);
            uint seed = _randomSeed;

            Entities
                .WithAll<ZombieTag>()
                .WithNone<LocalAvoidanceData>()
                .ForEach((Entity entity, int entityInQueryIndex) =>
                {
                    uint localSeed = seed + (uint)entityInQueryIndex;
                    localSeed = localSeed * 1664525 + 1013904223; // Simple LCG for unique seeds
                    ecb.AddComponent(entity, LocalAvoidanceData.CreateRandom(localSeed));
                }).WithoutBurst().Run();

            _randomSeed += 1000; // Update for next batch
            ecb.Playback(EntityManager);
            ecb.Dispose();
        }
    }
}