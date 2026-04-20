using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Overrides idle Looter / Farmer JobIntents with a Barracks-supply task when an understocked Barracks exists. Two-phase routing (carrying → Barracks, empty → Capital) is refined each tick like BuilderJobSystem. Burst ISystem — single-worker Schedule keeps the shared Capital-hex capture race-free ahead of the multi-threaded push.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(JobSystem))]
    [UpdateBefore(typeof(JobMovementExecutor))]
    public partial struct BarracksSupplyJobSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            int2 capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;

            var needy = new NativeList<NeedyBarracks>(4, Allocator.TempJob);
            foreach (var (building, cap, storage, entity) in
                     SystemAPI.Query<RefRO<Building>, RefRO<StorageCapacity>, DynamicBuffer<InventorySlot>>()
                              .WithAll<BarracksTag>()
                              .WithEntityAccess())
            {
                int total = 0;
                for (int i = 0; i < storage.Length; i++) total += storage[i].Count;
                if (total >= cap.ValueRO.Total) continue;
                needy.Add(new NeedyBarracks { Entity = entity, Hex = building.ValueRO.RootHex });
            }

            if (needy.Length == 0)
            {
                needy.Dispose();
                return;
            }

            state.Dependency = new BarracksSupplyPlannerJob
            {
                CapitalHex = capitalHex,
                Needy      = needy.AsDeferredJobArray(),
            }.Schedule(state.Dependency);

            state.Dependency = needy.Dispose(state.Dependency);
        }
    }

    internal struct NeedyBarracks
    {
        public Entity Entity;
        public int2   Hex;
    }

    [BurstCompile]
    public partial struct BarracksSupplyPlannerJob : IJobEntity
    {
        public int2 CapitalHex;
        [ReadOnly] public NativeArray<NeedyBarracks> Needy;

        void Execute(in JobPriorities priorities,
                     in UnitMovement movement,
                     in DynamicBuffer<InventorySlot> inventory,
                     ref JobIntent intent)
        {
            if (priorities.Looter == 0 && priorities.Farmer == 0) return;

            byte currentKind = intent.Kind;
            if (currentKind != JobKind.None && currentKind != JobKind.Looter) return;

            var here = movement.CurrentHex;
            Entity bestEntity = Entity.Null;
            int2   bestHex    = default;
            int    bestDist   = int.MaxValue;
            for (int i = 0; i < Needy.Length; i++)
            {
                var n = Needy[i];
                int d = HexDistance(here, n.Hex);
                if (d < bestDist)
                {
                    bestDist   = d;
                    bestEntity = n.Entity;
                    bestHex    = n.Hex;
                }
            }
            if (bestEntity == Entity.Null) return;

            bool carrying = CarriesSupply(inventory);
            intent = new JobIntent
            {
                Kind         = JobKind.Looter,
                TargetHex    = carrying ? bestHex : CapitalHex,
                TargetEntity = bestEntity,
            };
        }

        static bool CarriesSupply(in DynamicBuffer<InventorySlot> inv)
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
