using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionDispatchSystem))]
    public partial struct BarracksSupplyJobSystem : ISystem
    {
        EntityQuery _candidateQuery;

        public void OnCreate(ref SystemState state)
        {
            _candidateQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<ProfessionPriorities, ProfessionIntent, UnitMovement>()
                .Build(ref state);
        }

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

            var candidates = _candidateQuery.ToEntityListAsync(state.WorldUpdateAllocator,
                                                               state.Dependency,
                                                               out var candHandle);
            var dep = JobHandle.CombineDependencies(state.Dependency, candHandle);

            var jobHandle = new BarracksSupplyPlannerJob
            {
                CapitalHex     = capitalHex,
                Needy          = needy,
                Candidates     = candidates,
                PriorityLookup = SystemAPI.GetComponentLookup<ProfessionPriorities>(true),
                MovementLookup = SystemAPI.GetComponentLookup<UnitMovement>(true),
                IntentLookup   = SystemAPI.GetComponentLookup<ProfessionIntent>(false),
                PackLookup     = SystemAPI.GetBufferLookup<PackSlot>(true),
            }.Schedule(dep);

            state.Dependency = needy.Dispose(jobHandle);
        }
    }

    public struct NeedyBarracks
    {
        public Entity Entity;
        public int2   Hex;
    }

    [BurstCompile]
    struct BarracksSupplyPlannerJob : IJob
    {
        const int LooterSlotsPerBarracks = 2;

        public int2 CapitalHex;
        [ReadOnly] public NativeList<NeedyBarracks> Needy;
        [ReadOnly] public NativeList<Entity>        Candidates;
        [ReadOnly] public ComponentLookup<ProfessionPriorities> PriorityLookup;
        [ReadOnly] public ComponentLookup<UnitMovement>         MovementLookup;
        public ComponentLookup<ProfessionIntent>                IntentLookup;
        [ReadOnly] public BufferLookup<PackSlot>                PackLookup;

        public void Execute()
        {
            int n = Needy.Length;
            var slots = new NativeArray<int>(n, Allocator.Temp);

            for (int c = 0; c < Candidates.Length; c++)
            {
                var entity = Candidates[c];
                if (!PriorityLookup.HasComponent(entity)) continue;
                if (!MovementLookup.HasComponent(entity)) continue;
                if (!IntentLookup.HasComponent(entity))   continue;

                var priorities = PriorityLookup[entity];
                if (priorities.Looter == 0 && priorities.Farmer == 0) continue;

                var intent = IntentLookup[entity];
                if (intent.Kind != ProfessionKind.None && intent.Kind != ProfessionKind.Looter) continue;

                var here = MovementLookup[entity].CurrentHex;

                int bestIdx  = -1;
                int bestDist = int.MaxValue;
                for (int i = 0; i < n; i++)
                {
                    if (slots[i] >= LooterSlotsPerBarracks) continue;
                    int d = HexDistance(here, Needy[i].Hex);
                    if (d < bestDist)
                    {
                        bestDist = d;
                        bestIdx  = i;
                    }
                }
                if (bestIdx < 0) continue;
                if (!PackLookup.HasBuffer(entity)) continue;

                bool carrying = CarriesSupply(PackLookup[entity]);
                IntentLookup[entity] = new ProfessionIntent
                {
                    Kind         = ProfessionKind.Looter,
                    TargetHex    = carrying ? Needy[bestIdx].Hex : CapitalHex,
                    TargetEntity = Needy[bestIdx].Entity,
                };
                slots[bestIdx]++;
            }

            slots.Dispose();
        }

        static bool CarriesSupply(in DynamicBuffer<PackSlot> inv)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].Count == 0) continue;
                if (inv[i].ItemId == (ushort)ItemId.Coin) return true;
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
