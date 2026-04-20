using System.Collections.Generic;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Overrides idle Looter / Farmer JobIntents with a Barracks-supply task when an understocked Barracks exists and the Capital has the matching items. Two-phase routing (carrying → Barracks, empty → Capital) is refined each tick like BuilderJobSystem.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(JobSystem))]
    [UpdateBefore(typeof(JobMovementExecutor))]
    public partial class BarracksSupplyJobSystem : SystemBase
    {
        readonly List<(Entity Barracks, int2 Hex, int Stock, int Capacity)> _needy = new();

        protected override void OnUpdate()
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            int2 capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;

            _needy.Clear();
            foreach (var (building, prod, storage, entity) in
                     SystemAPI.Query<RefRO<Building>, RefRO<BarracksProduction>, DynamicBuffer<BarracksStorage>>()
                              .WithAll<BarracksTag>()
                              .WithEntityAccess())
            {
                int total = 0;
                for (int i = 0; i < storage.Length; i++) total += storage[i].Count;
                if (total >= prod.ValueRO.StorageCapacity) continue;
                _needy.Add((entity, building.ValueRO.RootHex, total, prod.ValueRO.StorageCapacity));
            }
            if (_needy.Count == 0) return;

            foreach (var (priorities, intentRW, inventory, movement) in
                     SystemAPI.Query<RefRO<JobPriorities>, RefRW<JobIntent>,
                                     DynamicBuffer<InventorySlot>, RefRO<UnitMovement>>())
            {
                var p = priorities.ValueRO;
                if (p.Looter == 0 && p.Farmer == 0) continue;

                byte currentKind = intentRW.ValueRO.Kind;
                if (currentKind != JobKind.None && currentKind != JobKind.Looter) continue;

                var (barracks, barracksHex, _, _) = NearestNeedy(movement.ValueRO.CurrentHex);
                if (barracks == Entity.Null) continue;

                bool carrying = CarriesSupply(inventory);
                intentRW.ValueRW = new JobIntent
                {
                    Kind         = JobKind.Looter,
                    TargetHex    = carrying ? barracksHex : capitalHex,
                    TargetEntity = barracks,
                };
            }
        }

        (Entity, int2, int, int) NearestNeedy(int2 from)
        {
            Entity best = Entity.Null;
            int2   bestHex = default;
            int    bestStock = 0, bestCap = 0, bestDist = int.MaxValue;
            for (int i = 0; i < _needy.Count; i++)
            {
                var n = _needy[i];
                int d = HexDistance(from, n.Hex);
                if (d < bestDist)
                {
                    bestDist = d; best = n.Barracks; bestHex = n.Hex;
                    bestStock = n.Stock; bestCap = n.Capacity;
                }
            }
            return (best, bestHex, bestStock, bestCap);
        }

        static bool CarriesSupply(DynamicBuffer<InventorySlot> inv)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].Count == 0) continue;
                if (inv[i].ItemId == (ushort)ItemId.BanditCoin) return true;
                if (FoodItems.IsFood(inv[i].ItemId)) return true;
            }
            return false;
        }

        static int HexDistance(int2 a, int2 b)
        {
            int dq = b.x - a.x, dr = b.y - a.y, ds = -dq - dr;
            return (math.abs(dq) + math.abs(dr) + math.abs(ds)) / 2;
        }
    }
}
