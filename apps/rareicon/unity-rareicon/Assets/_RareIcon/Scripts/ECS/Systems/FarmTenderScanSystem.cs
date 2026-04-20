using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Marks FarmProduction.TenderBonus = 1 when any Farmer-intent unit stands on the farm's 7-hex footprint; otherwise 0.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(JobSystem))]
    public partial class FarmTenderScanSystem : SystemBase
    {
        static readonly int2[] FarmFootprint = new[]
        {
            new int2( 0,  0),
            new int2( 1,  0), new int2(-1,  0),
            new int2( 0,  1), new int2( 0, -1),
            new int2( 1, -1), new int2(-1,  1),
        };

        protected override void OnUpdate()
        {
            var tendedHexes = new NativeHashSet<int2>(16, Allocator.Temp);
            foreach (var (intent, movement) in
                     SystemAPI.Query<RefRO<JobIntent>, RefRO<UnitMovement>>())
            {
                if (intent.ValueRO.Kind != JobKind.Farmer) continue;
                tendedHexes.Add(movement.ValueRO.CurrentHex);
            }

            foreach (var (building, prod) in
                     SystemAPI.Query<RefRO<Building>, RefRW<FarmProduction>>())
            {
                if (building.ValueRO.Type != BuildingType.Farm)
                {
                    prod.ValueRW.TenderBonus = 0f;
                    continue;
                }

                bool tended = false;
                var root = building.ValueRO.RootHex;
                for (int i = 0; i < FarmFootprint.Length; i++)
                {
                    if (tendedHexes.Contains(root + FarmFootprint[i])) { tended = true; break; }
                }
                prod.ValueRW.TenderBonus = tended ? 1f : 0f;
            }

            tendedHexes.Dispose();
        }
    }
}
