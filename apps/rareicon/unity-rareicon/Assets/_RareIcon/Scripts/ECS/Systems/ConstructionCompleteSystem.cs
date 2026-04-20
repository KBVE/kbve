using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>When a ConstructionSite's materials are all delivered, attach the per-type tag + production component and remove the site tracking so regular production systems pick up.</summary>
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    public partial class ConstructionCompleteSystem : SystemBase
    {
        protected override void OnCreate() => RequireForUpdate<ConstructionSite>();

        protected override void OnUpdate()
        {
            var ecb = new EntityCommandBuffer(Allocator.Temp);

            foreach (var (_, building, mats, entity) in
                     SystemAPI.Query<RefRO<ConstructionSite>, RefRO<Building>, DynamicBuffer<ConstructionMaterial>>()
                              .WithEntityAccess())
            {
                if (!AllDelivered(mats)) continue;

                byte type = building.ValueRO.Type;
                switch (type)
                {
                    case BuildingType.Farm:
                        ecb.AddComponent<FarmTag>(entity);
                        break;
                    case BuildingType.Barracks:
                        ecb.AddComponent<BarracksTag>(entity);
                        break;
                    case BuildingType.Furnace:
                        ecb.AddComponent<FurnaceTag>(entity);
                        break;
                }

                ecb.RemoveComponent<ConstructionSite>(entity);
                ecb.RemoveComponent<ConstructionMaterial>(entity);
            }

            ecb.Playback(EntityManager);
            ecb.Dispose();
        }

        static bool AllDelivered(DynamicBuffer<ConstructionMaterial> mats)
        {
            for (int i = 0; i < mats.Length; i++)
                if (mats[i].Delivered < mats[i].Needed) return false;
            return true;
        }
    }
}
