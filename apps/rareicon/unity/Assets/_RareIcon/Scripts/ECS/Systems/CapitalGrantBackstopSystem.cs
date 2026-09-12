using Unity.Entities;

namespace RareIcon
{
    /// <summary>Re-issues the Capital Land Grant to the King while no Capital exists in the world.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class CapitalGrantBackstopSystem : SystemBase
    {
        double _nextCheck;

        protected override void OnCreate() { }

        protected override void OnUpdate()
        {
            double t = SystemAPI.Time.ElapsedTime;
            if (t < _nextCheck) return;
            _nextCheck = t + 1.0;

            if (SystemAPI.HasSingleton<CapitalTag>()) return;

            foreach (var (_, entity) in
                     SystemAPI.Query<RefRO<KingTag>>().WithEntityAccess())
            {
                if (!EntityManager.HasBuffer<PackSlot>(entity)) continue;
                var pack = EntityManager.GetBuffer<PackSlot>(entity);

                bool hasGrant = false;
                for (int i = 0; i < pack.Length; i++)
                {
                    if (pack[i].ItemId == (ushort)ItemId.CapitalLandGrant && pack[i].Count > 0)
                    {
                        hasGrant = true;
                        break;
                    }
                }
                if (hasGrant) continue;

                pack.Add(new PackSlot
                {
                    Uid = UlidFactory.NewUid(),
                    ItemId = (ushort)ItemId.CapitalLandGrant,
                    Count = 1,
                });
            }
        }
    }
}
