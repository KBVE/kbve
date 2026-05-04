using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionDispatchSystem))]
    [UpdateAfter(typeof(TaskInvalidationSystem))]
    [UpdateAfter(typeof(BuilderJobSystem))]
    public partial struct UnitBehaviorSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<MovementGoal>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            bool hasCapital = SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital);
            int2 capitalHex = default;
            if (hasCapital) capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;

            var capitalFootprint = new NativeArray<int2>(7, Allocator.TempJob);
            if (hasCapital)
            {
                capitalFootprint[0] = capitalHex;
                capitalFootprint[1] = capitalHex + new int2( 1,  0);
                capitalFootprint[2] = capitalHex + new int2( 1, -1);
                capitalFootprint[3] = capitalHex + new int2( 0, -1);
                capitalFootprint[4] = capitalHex + new int2(-1,  0);
                capitalFootprint[5] = capitalHex + new int2(-1,  1);
                capitalFootprint[6] = capitalHex + new int2( 0,  1);
            }

            var foodHexes = new NativeList<int2>(16, Allocator.TempJob);
            foreach (var building in SystemAPI.Query<RefRO<Building>>().WithAll<ProvidesFood>())
                AppendFootprint(foodHexes, building.ValueRO.RootHex, building.ValueRO.Type);

            var sleepHexes = new NativeList<int2>(16, Allocator.TempJob);
            foreach (var building in SystemAPI.Query<RefRO<Building>>().WithAll<ProvidesSleep>())
                AppendFootprint(sleepHexes, building.ValueRO.RootHex, building.ValueRO.Type);

            var healService = state.World.GetExistingSystemManaged<HealFlowFieldService>();
            var cachedHealHexes = healService != null ? healService.HealerHexes : default;
            var healHexes = cachedHealHexes.IsCreated && cachedHealHexes.Length > 0
                ? new NativeArray<int2>(cachedHealHexes, Allocator.TempJob)
                : new NativeArray<int2>(0, Allocator.TempJob);

            SystemAPI.TryGetSingleton<SpatialHashSingleton>(out var spatial);

            var wildlife = new NativeList<int2>(64, Allocator.TempJob);
            foreach (var movement in
                     SystemAPI.Query<RefRO<UnitMovement>>()
                              .WithAll<PassiveAnimalTag>()
                              .WithNone<TamedTag>())
            {
                wildlife.Add(movement.ValueRO.CurrentHex);
            }

            var emitters = new NativeList<TerritoryEmitter>(4, Allocator.TempJob);
            foreach (var e in SystemAPI.Query<RefRO<TerritoryEmitter>>())
            {
                if (e.ValueRO.Radius == 0) continue;
                if (e.ValueRO.OwnerFaction != FactionType.Player) continue;
                emitters.Add(e.ValueRO);
            }

            var forageHexes = new NativeList<int2>(128, Allocator.TempJob);
            foreach (var (res, coord) in
                     SystemAPI.Query<RefRO<HexResources>, RefRO<HexCoord>>())
            {
                var r = res.ValueRO;
                if ((r.Berries | r.Mushrooms | r.Herbs | r.Cactus
                    | r.Wood | r.Leaves | r.Branches) == 0) continue;
                forageHexes.Add(new int2(coord.ValueRO.Q, coord.ValueRO.R));
            }

            var jobHandle = new UnitBehaviorJob
            {
                HasCapital        = hasCapital,
                CapitalFootprint  = capitalFootprint,
                FoodProviderHexes = foodHexes.AsArray(),
                SleepProviderHexes= sleepHexes.AsArray(),
                HealProviderHexes = healHexes,
                Wildlife          = wildlife.AsArray(),
                FriendlyEmitters  = emitters.AsArray(),
                ForageHexes       = forageHexes.AsArray(),
                SpatialHash       = spatial.Hash,
            }.ScheduleParallel(state.Dependency);

            state.Dependency = JobHandle.CombineDependencies(
                JobHandle.CombineDependencies(
                    JobHandle.CombineDependencies(wildlife.Dispose(jobHandle), emitters.Dispose(jobHandle)),
                    JobHandle.CombineDependencies(forageHexes.Dispose(jobHandle), capitalFootprint.Dispose(jobHandle))),
                JobHandle.CombineDependencies(
                    JobHandle.CombineDependencies(foodHexes.Dispose(jobHandle), sleepHexes.Dispose(jobHandle)),
                    healHexes.Dispose(jobHandle)));
        }

        static void AppendFootprint(NativeList<int2> list, int2 root, byte buildingType)
        {
            list.Add(root);
            if (buildingType == BuildingType.Capital)
            {
                list.Add(root + new int2( 1,  0));
                list.Add(root + new int2( 1, -1));
                list.Add(root + new int2( 0, -1));
                list.Add(root + new int2(-1,  0));
                list.Add(root + new int2(-1,  1));
                list.Add(root + new int2( 0,  1));
            }
        }
    }

    [BurstCompile]
    [WithNone(typeof(ControlledUnitTag))]
    [WithNone(typeof(GarrisonPost))]
    [WithNone(typeof(GarrisonedTag))]
    public partial struct UnitBehaviorJob : IJobEntity
    {
        public bool HasCapital;
        [ReadOnly] public NativeArray<int2>              CapitalFootprint;
        [ReadOnly] public NativeArray<int2>              FoodProviderHexes;
        [ReadOnly] public NativeArray<int2>              SleepProviderHexes;
        [ReadOnly] public NativeArray<int2>              HealProviderHexes;
        [ReadOnly] public NativeArray<int2>              Wildlife;
        [ReadOnly] public NativeArray<TerritoryEmitter>  FriendlyEmitters;
        [ReadOnly] public NativeArray<int2>              ForageHexes;
        [ReadOnly] public NativeParallelMultiHashMap<int, HashedTarget> SpatialHash;

        const int HuntRadius   = 8;
        const int GuardRadius  = 6;
        const int ForageRadius = 20;

        void Execute(Entity entity,
                     in Faction faction,
                     in ReliefIntent relief,
                     in ProfessionIntent intent,
                     in ProfessionPriorities priorities,
                     in UnitMovement movement,
                     in LocalTransform transform,
                     in UnitBagStatus bagStatus,
                     ref MovementGoal goal)
        {
            if (faction.Value != FactionType.Player) return;

            if (goal.Priority >= GoalPriority.Order) return;
            if (goal.Priority >= GoalPriority.Flee)  return;

            uint spread = UnitHashOps.Spread(in entity);

            if (relief.Kind == ReliefKind.Eat)
            {
                if (FoodProviderHexes.Length > 0)
                    Write(ref goal, GoalKind.ReturnToBase, GoalPriority.Return, PickClosestSpread(movement.CurrentHex, FoodProviderHexes, spread));
                else if (HasCapital)
                    Write(ref goal, GoalKind.ReturnToBase, GoalPriority.Return, PickClosestSpread(movement.CurrentHex, CapitalFootprint, spread));
                return;
            }
            if (relief.Kind == ReliefKind.Sleep)
            {
                if (SleepProviderHexes.Length > 0)
                    Write(ref goal, GoalKind.ReturnToBase, GoalPriority.Return, PickClosestSpread(movement.CurrentHex, SleepProviderHexes, spread));
                else if (HasCapital)
                    Write(ref goal, GoalKind.ReturnToBase, GoalPriority.Return, PickClosestSpread(movement.CurrentHex, CapitalFootprint, spread));
                return;
            }
            if (relief.Kind == ReliefKind.Heal)
            {
                if (HealProviderHexes.Length > 0)
                    Write(ref goal, GoalKind.ReturnToBase, GoalPriority.Return, PickClosestSpread(movement.CurrentHex, HealProviderHexes, spread));
                else if (HasCapital)
                    Write(ref goal, GoalKind.ReturnToBase, GoalPriority.Return, PickClosestSpread(movement.CurrentHex, CapitalFootprint, spread));
                return;
            }

            if (priorities.Guard > 0 && FriendlyEmitters.Length > 0
                && TryFindIntruder(transform.Position, out var guardHex))
            {
                Write(ref goal, GoalKind.Hunt, GoalPriority.Hunt, guardHex);
                return;
            }

            bool committedBuilder = intent.Kind == ProfessionKind.Builder
                && intent.TargetEntity != Entity.Null;
            if (committedBuilder)
            {
                Write(ref goal, GoalKind.MoveToHex, GoalPriority.Harvest, intent.TargetHex);
                return;
            }

            if (bagStatus.IsFull)
            {
                if (HasCapital)
                    Write(ref goal, GoalKind.ReturnToBase, GoalPriority.Return, PickClosestSpread(movement.CurrentHex, CapitalFootprint, spread));
                return;
            }

            if (intent.Kind != ProfessionKind.None)
            {
                Write(ref goal, GoalKind.MoveToHex, GoalPriority.Harvest, intent.TargetHex);
                return;
            }

            if (priorities.Hunter > 0 && Wildlife.Length > 0
                && TryFindWildlife(movement.CurrentHex, out var huntHex))
            {
                Write(ref goal, GoalKind.Hunt, GoalPriority.Hunt, huntHex);
                return;
            }

            bool canForage = priorities.Looter > 0
                          || priorities.Lumberjack > 0
                          || priorities.Miner > 0
                          || priorities.Farmer > 0;
            if (canForage && ForageHexes.Length > 0
                && TryFindForage(movement.CurrentHex, out var forageHex))
            {
                Write(ref goal, GoalKind.MoveToHex, GoalPriority.Harvest, forageHex);
                return;
            }

            if (goal.Kind != GoalKind.None)
                Write(ref goal, GoalKind.None, GoalPriority.None, movement.CurrentHex);
        }

        bool TryFindForage(int2 origin, out int2 hex)
        {
            int bestDist = int.MaxValue;
            int2 bestHex = origin;
            bool found = false;
            for (int i = 0; i < ForageHexes.Length; i++)
            {
                int d = HexDist(origin, ForageHexes[i]);
                if (d > ForageRadius) continue;
                if (d >= bestDist) continue;
                bestDist = d;
                bestHex  = ForageHexes[i];
                found    = true;
            }
            hex = bestHex;
            return found;
        }

        static void Write(ref MovementGoal goal, byte kind, byte priority, int2 target)
        {
            goal = new MovementGoal { Kind = kind, Priority = priority, TargetHex = target };
        }

        static int2 PickClosestSpread(int2 from, NativeArray<int2> hexes, uint spread)
        {
            int2 best = hexes[0];
            int  bestScore = HexDist(from, best) * 4 + (int)(spread % 4u);
            for (int i = 1; i < hexes.Length; i++)
            {
                int d = HexDist(from, hexes[i]);
                int score = d * 4 + (int)((spread + UnitHashOps.Spread((uint)i)) % 4u);
                if (score < bestScore) { bestScore = score; best = hexes[i]; }
            }
            return best;
        }

        bool TryFindWildlife(int2 origin, out int2 hex)
        {
            int bestDist = int.MaxValue;
            int2 bestHex = origin;
            bool found = false;
            for (int i = 0; i < Wildlife.Length; i++)
            {
                int d = HexDist(origin, Wildlife[i]);
                if (d > HuntRadius) continue;
                if (d >= bestDist) continue;
                bestDist = d;
                bestHex = Wildlife[i];
                found = true;
            }
            hex = bestHex;
            return found;
        }

        bool TryFindIntruder(float3 originWorld, out int2 hex)
        {
            if (!SpatialHash.IsCreated) { hex = default; return false; }

            float bestSq = float.MaxValue;
            int2 bestHex = default;
            bool found = false;

            int cx = (int)math.floor(originWorld.x / SpatialHashSystem.CellSize);
            int cy = (int)math.floor(originWorld.y / SpatialHashSystem.CellSize);

            for (int dx = -GuardRadius; dx <= GuardRadius; dx++)
            {
                for (int dy = -GuardRadius; dy <= GuardRadius; dy++)
                {
                    int key = SpatialHashSystem.CellKey(cx + dx, cy + dy);
                    if (!SpatialHash.TryGetFirstValue(key, out var target, out var it)) continue;

                    do
                    {
                        if (target.Faction != FactionType.Hostile
                            && target.Faction != FactionType.Beast) continue;

                        int2 targetHex = HexMeshUtil.WorldToHex(target.Position.x, target.Position.y, 0.25f);
                        if (!InsideAnyEmitter(targetHex)) continue;

                        float d2 = math.distancesq(
                            new float2(originWorld.x, originWorld.y),
                            target.Position);
                        if (d2 < bestSq)
                        {
                            bestSq = d2;
                            bestHex = targetHex;
                            found = true;
                        }
                    } while (SpatialHash.TryGetNextValue(out target, ref it));
                }
            }

            hex = bestHex;
            return found;
        }

        bool InsideAnyEmitter(int2 hex)
        {
            for (int i = 0; i < FriendlyEmitters.Length; i++)
            {
                var e = FriendlyEmitters[i];
                if (HexDist(hex, e.Center) <= e.Radius) return true;
            }
            return false;
        }

        static int HexDist(int2 a, int2 b)
        {
            int dq = a.x - b.x, dr = a.y - b.y;
            return (math.abs(dq) + math.abs(dr) + math.abs(dq + dr)) / 2;
        }
    }
}
