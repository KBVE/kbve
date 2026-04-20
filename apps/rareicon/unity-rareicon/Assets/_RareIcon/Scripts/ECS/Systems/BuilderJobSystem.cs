using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Two-phase target routing for Builder-intent units: go to Capital when empty (pickup), go to the target site when carrying matching materials (delivery). JobSystem picks the site; this refines the TargetHex.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(JobSystem))]
    [UpdateBefore(typeof(JobMovementExecutor))]
    public partial class BuilderJobSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            int2 capitalHex = default;
            bool hasCapital = false;
            foreach (var b in SystemAPI.Query<RefRO<Building>>())
            {
                if (b.ValueRO.Type == BuildingType.Capital)
                {
                    capitalHex = b.ValueRO.RootHex;
                    hasCapital = true;
                    break;
                }
            }
            if (!hasCapital) return;

            var materialBufferLookup = SystemAPI.GetBufferLookup<ConstructionMaterial>(isReadOnly: true);
            var siteLookup           = SystemAPI.GetComponentLookup<ConstructionSite>(isReadOnly: true);

            foreach (var (intentRef, inventory) in
                     SystemAPI.Query<RefRW<JobIntent>, DynamicBuffer<InventorySlot>>())
            {
                var intent = intentRef.ValueRO;
                if (intent.Kind != JobKind.Builder) continue;
                if (intent.TargetEntity == Entity.Null) continue;
                if (!siteLookup.HasComponent(intent.TargetEntity)) continue;
                if (!materialBufferLookup.HasBuffer(intent.TargetEntity)) continue;

                var mats    = materialBufferLookup[intent.TargetEntity];
                var siteHex = siteLookup[intent.TargetEntity].RootHex;

                bool carrying = CarriesMatchingMaterial(inventory, mats);
                intentRef.ValueRW = new JobIntent
                {
                    Kind         = JobKind.Builder,
                    TargetHex    = carrying ? siteHex : capitalHex,
                    TargetEntity = intent.TargetEntity,
                };
            }
        }

        static bool CarriesMatchingMaterial(DynamicBuffer<InventorySlot> inv, DynamicBuffer<ConstructionMaterial> mats)
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
