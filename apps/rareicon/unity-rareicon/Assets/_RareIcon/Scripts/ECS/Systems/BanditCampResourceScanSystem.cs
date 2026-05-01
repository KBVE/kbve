using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Refills the per-camp <see cref="BanditResourceHex"/> cache on a fixed cadence. Replaces the old per-laborer-per-tick O(R²) hex scan with a per-camp-per-30s scan; chores then read from the buffer with one lookup per tick. Caps buffer at <see cref="MaxCachedHexes"/> so growth stays bounded even on resource-rich biomes.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateBefore(typeof(BanditChoreSystem))]
    public partial class BanditCampResourceScanSystem : SystemBase
    {
        const int ScanRadius      = 6;
        const int MaxCachedHexes  = 48;

        protected override void OnCreate()
        {
            RequireForUpdate<BanditResourceScanState>();
            RequireForUpdate<HexDBSingleton>();
        }

        protected override void OnUpdate()
        {
            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);
            var hexLookup = SystemAPI.GetSingleton<HexDBSingleton>().Lookup;
            var resLookup = SystemAPI.GetComponentLookup<HexResources>(true);

            foreach (var (scanRef, building, cache) in
                     SystemAPI.Query<RefRW<BanditResourceScanState>,
                                     RefRO<Building>,
                                     DynamicBuffer<BanditResourceHex>>()
                              .WithAll<BanditCampTag>())
            {
                ref var scan = ref scanRef.ValueRW;
                if (nowTick < scan.NextScanTick) continue;
                scan.NextScanTick = nowTick + scan.ScanCadenceTicks;

                int2 campHex = building.ValueRO.RootHex;
                cache.Clear();
                for (int dx = -ScanRadius; dx <= ScanRadius && cache.Length < MaxCachedHexes; dx++)
                {
                    for (int dy = -ScanRadius; dy <= ScanRadius && cache.Length < MaxCachedHexes; dy++)
                    {
                        int2 candidate = new int2(campHex.x + dx, campHex.y + dy);
                        if (AxialDistance(candidate - campHex) > ScanRadius) continue;
                        if (!hexLookup.TryGetValue(candidate, out var hexEntity)) continue;
                        if (!resLookup.HasComponent(hexEntity)) continue;
                        var res = resLookup[hexEntity];
                        if (res.Wood == 0 && res.Stone == 0) continue;
                        cache.Add(new BanditResourceHex { Hex = candidate });
                    }
                }
            }
        }

        static int AxialDistance(int2 d)
        {
            int ds = -d.x - d.y;
            return (math.abs(d.x) + math.abs(d.y) + math.abs(ds)) / 2;
        }
    }
}
