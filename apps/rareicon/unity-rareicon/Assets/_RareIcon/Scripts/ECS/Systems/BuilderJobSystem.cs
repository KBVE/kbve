using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Two-phase target routing for Builder-intent units: go to Capital when empty (pickup), go to the target site when carrying matching materials (delivery). JobSystem picks the site; this refines the TargetHex. Burst ISystem off the main thread — single-worker Schedule matches the other supply-job refiners.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(JobSystem))]
    [UpdateBefore(typeof(JobMovementExecutor))]
    public partial struct BuilderJobSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            int2 capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;

            state.Dependency = new BuilderJobRefineJob
            {
                CapitalHex      = capitalHex,
                PackLookup       = SystemAPI.GetBufferLookup<PackSlot>(true),
                MaterialLookup  = SystemAPI.GetBufferLookup<ConstructionMaterial>(true),
                SiteLookup      = SystemAPI.GetComponentLookup<ConstructionSite>(true),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct BuilderJobRefineJob : IJobEntity
    {
        public int2 CapitalHex;

        [ReadOnly] public BufferLookup<PackSlot>        PackLookup;
        [ReadOnly] public BufferLookup<ConstructionMaterial> MaterialLookup;
        [ReadOnly] public ComponentLookup<ConstructionSite>  SiteLookup;

        void Execute(Entity entity, ref JobIntent intent)
        {
            if (intent.Kind != JobKind.Builder) return;
            if (intent.TargetEntity == Entity.Null) return;
            if (!SiteLookup.HasComponent(intent.TargetEntity)) return;
            if (!MaterialLookup.HasBuffer(intent.TargetEntity)) return;
            if (!PackLookup.HasBuffer(entity)) return;

            var inventory = PackLookup[entity];
            var mats      = MaterialLookup[intent.TargetEntity];
            var siteHex   = SiteLookup[intent.TargetEntity].RootHex;

            bool carrying = CarriesMatchingMaterial(inventory, mats);
            intent = new JobIntent
            {
                Kind         = JobKind.Builder,
                TargetHex    = carrying ? siteHex : CapitalHex,
                TargetEntity = intent.TargetEntity,
            };
        }

        static bool CarriesMatchingMaterial(in DynamicBuffer<PackSlot> inv,
                                            in DynamicBuffer<ConstructionMaterial> mats)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].Count == 0) continue;
                for (int j = 0; j < mats.Length; j++)
                {
                    if (mats[j].ItemId == inv[i].ItemId && mats[j].Delivered < mats[j].Needed)
                        return true;
                }
            }
            return false;
        }
    }
}
