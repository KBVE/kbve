using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionDispatchSystem))]
    public partial struct BarracksSupplyJobSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            int2 capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;

            var needy = new NativeList<NeedyBarracks>(4, Allocator.TempJob);
            foreach (var (building, status, entity) in
                     SystemAPI.Query<RefRO<Building>, RefRO<BarracksSupplyStatus>>()
                              .WithAll<BarracksTag>()
                              .WithEntityAccess())
            {
                if (status.ValueRO.IsNeedy == 0) continue;
                needy.Add(new NeedyBarracks { Entity = entity, Hex = building.ValueRO.RootHex });
            }

            if (needy.Length == 0)
            {
                needy.Dispose();
                return;
            }

            var jobHandle = new BarracksSupplyPlannerJob
            {
                CapitalHex = capitalHex,
                Needy      = needy.AsDeferredJobArray(),
                PackLookup  = SystemAPI.GetBufferLookup<PackSlot>(true),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = needy.Dispose(jobHandle);
        }
    }

    public struct NeedyBarracks
    {
        public Entity Entity;
        public int2   Hex;
    }

    [BurstCompile]
    public partial struct BarracksSupplyPlannerJob : IJobEntity
    {
        public int2 CapitalHex;
        [ReadOnly] public NativeArray<NeedyBarracks> Needy;
        [ReadOnly] public BufferLookup<PackSlot> PackLookup;

        void Execute(Entity entity,
                     in ProfessionPriorities priorities,
                     in UnitMovement movement,
                     ref ProfessionIntent intent)
        {
            if (priorities.Looter == 0 && priorities.Farmer == 0) return;

            byte currentKind = intent.Kind;
            if (currentKind != ProfessionKind.None && currentKind != ProfessionKind.Looter) return;

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
            if (!PackLookup.HasBuffer(entity)) return;

            bool carrying = CarriesSupply(PackLookup[entity]);
            intent = new ProfessionIntent
            {
                Kind         = ProfessionKind.Looter,
                TargetHex    = carrying ? bestHex : CapitalHex,
                TargetEntity = bestEntity,
            };
        }

        static bool CarriesSupply(in DynamicBuffer<PackSlot> inv)
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
            int dq = a.x - b.x, dr = a.y - b.y;
            return (math.abs(dq) + math.abs(dr) + math.abs(dq + dr)) / 2;
        }
    }
}
