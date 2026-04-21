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
                HasCapital       = hasCapital,
                CapitalHex       = capitalHex,
                Wildlife         = wildlife.AsArray(),
                FriendlyEmitters = emitters.AsArray(),
                ForageHexes      = forageHexes.AsArray(),
                SpatialHash      = spatial.Hash,
            }.ScheduleParallel(state.Dependency);

            state.Dependency = JobHandle.CombineDependencies(
                JobHandle.CombineDependencies(wildlife.Dispose(jobHandle), emitters.Dispose(jobHandle)),
                forageHexes.Dispose(jobHandle));
        }
    }

    [BurstCompile]
    [WithNone(typeof(ControlledUnitTag))]
    [WithNone(typeof(GarrisonPost))]
    public partial struct UnitBehaviorJob : IJobEntity
    {
        public bool HasCapital;
        public int2 CapitalHex;
        [ReadOnly] public NativeArray<int2>              Wildlife;
        [ReadOnly] public NativeArray<TerritoryEmitter>  FriendlyEmitters;
        [ReadOnly] public NativeArray<int2>              ForageHexes;
        [ReadOnly] public NativeParallelMultiHashMap<int, HashedTarget> SpatialHash;

        const int HuntRadius   = 8;
        const int GuardRadius  = 6;
        const int ForageRadius = 20;

        void Execute(in Faction faction,
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

            if (relief.Kind == ReliefKind.Sleep
                || relief.Kind == ReliefKind.Eat
                || relief.Kind == ReliefKind.Heal)
            {
                if (HasCapital)
                    Write(ref goal, GoalKind.ReturnToBase, GoalPriority.Return, CapitalHex);
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
                    Write(ref goal, GoalKind.ReturnToBase, GoalPriority.Return, CapitalHex);
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
