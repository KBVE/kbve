using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Per-unit goal selection — relief targets (eat/sleep/heal), guard hunt, harvest pursuit, wildlife hunt, forage wandering. Five prep scans (food / sleep / wildlife / emitters / forage hexes) feed the per-unit UnitBehaviorJob; all five now run as parallel [BurstCompile] IJobEntity passes writing into persistent NativeLists via ParallelWriter, instead of main-thread foreach loops. UnitBehaviorJob still does the actual per-unit goal write — this PR just gets the prep stage off the main thread the same way #11719/#11723/#11728 did for ProfessionDispatchSystem.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionDispatchSystem))]
    [UpdateAfter(typeof(TaskInvalidationSystem))]
    [UpdateAfter(typeof(BuilderJobSystem))]
    public partial struct UnitBehaviorSystem : ISystem
    {
        NativeList<int2>             _foodHexes;
        NativeList<int2>             _sleepHexes;
        NativeList<int2>             _wildlifeHexes;
        NativeList<int2>             _forageHexes;
        NativeList<TerritoryEmitter> _emitters;

        EntityQuery _foodQuery;
        EntityQuery _sleepQuery;
        EntityQuery _wildlifeQuery;
        EntityQuery _emitterQuery;
        EntityQuery _forageQuery;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<MovementGoal>();

            _foodHexes     = new NativeList<int2>(64, Allocator.Persistent);
            _sleepHexes    = new NativeList<int2>(64, Allocator.Persistent);
            _wildlifeHexes = new NativeList<int2>(256, Allocator.Persistent);
            _forageHexes   = new NativeList<int2>(1024, Allocator.Persistent);
            _emitters      = new NativeList<TerritoryEmitter>(16, Allocator.Persistent);

            _foodQuery     = SystemAPI.QueryBuilder().WithAll<Building, ProvidesFood>().Build();
            _sleepQuery    = SystemAPI.QueryBuilder().WithAll<Building, ProvidesSleep>().Build();
            _wildlifeQuery = SystemAPI.QueryBuilder().WithAll<UnitMovement, PassiveAnimalTag>().WithNone<TamedTag>().Build();
            _emitterQuery  = SystemAPI.QueryBuilder().WithAll<TerritoryEmitter>().Build();
            _forageQuery   = SystemAPI.QueryBuilder().WithAll<HexResources, HexCoord>().Build();
        }

        public void OnDestroy(ref SystemState state)
        {
            state.CompleteDependency();
            if (_foodHexes.IsCreated)     _foodHexes.Dispose();
            if (_sleepHexes.IsCreated)    _sleepHexes.Dispose();
            if (_wildlifeHexes.IsCreated) _wildlifeHexes.Dispose();
            if (_forageHexes.IsCreated)   _forageHexes.Dispose();
            if (_emitters.IsCreated)      _emitters.Dispose();
        }

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

            int healCount = 0;
            DynamicBuffer<HealerHexElement> healSrc = default;
            if (SystemAPI.TryGetSingletonEntity<HealFlowFieldSingleton>(out var healSingleton))
            {
                healSrc = SystemAPI.GetBuffer<HealerHexElement>(healSingleton);
                healCount = healSrc.Length;
            }
            var healHexes = new NativeArray<int2>(healCount, Allocator.TempJob);
            for (int i = 0; i < healCount; i++) healHexes[i] = healSrc[i].Hex;

            SystemAPI.TryGetSingleton<SpatialHashSingleton>(out var spatial);

            int foodCount     = _foodQuery.CalculateEntityCount();
            int sleepCount    = _sleepQuery.CalculateEntityCount();
            int wildlifeCount = _wildlifeQuery.CalculateEntityCount();
            int emitterCount  = _emitterQuery.CalculateEntityCount();
            int forageCount   = _forageQuery.CalculateEntityCount();

            EnsureCapacity(ref _foodHexes,     foodCount * 7);
            EnsureCapacity(ref _sleepHexes,    sleepCount * 7);
            EnsureCapacity(ref _wildlifeHexes, wildlifeCount);
            EnsureCapacity(ref _emitters,      emitterCount);
            EnsureCapacity(ref _forageHexes,   forageCount);

            var clearJob = new ClearListsJob
            {
                Food     = _foodHexes,
                Sleep    = _sleepHexes,
                Wildlife = _wildlifeHexes,
                Forage   = _forageHexes,
                Emitters = _emitters,
            };
            state.Dependency = clearJob.Schedule(state.Dependency);

            var foodHandle     = new BuildFoodHexesJob     { Writer = _foodHexes.AsParallelWriter() }.ScheduleParallel(state.Dependency);
            var sleepHandle    = new BuildSleepHexesJob    { Writer = _sleepHexes.AsParallelWriter() }.ScheduleParallel(state.Dependency);
            var wildlifeHandle = new BuildWildlifeHexesJob { Writer = _wildlifeHexes.AsParallelWriter() }.ScheduleParallel(state.Dependency);
            var emittersHandle = new BuildEmittersJob      { Writer = _emitters.AsParallelWriter() }.ScheduleParallel(state.Dependency);
            var forageHandle   = new BuildForageHexesJob   { Writer = _forageHexes.AsParallelWriter() }.ScheduleParallel(state.Dependency);

            var prepHandle = JobHandle.CombineDependencies(
                JobHandle.CombineDependencies(foodHandle, sleepHandle, wildlifeHandle),
                JobHandle.CombineDependencies(emittersHandle, forageHandle));

            state.Dependency = new UnitBehaviorJob
            {
                HasCapital         = hasCapital,
                CapitalFootprint   = capitalFootprint,
                FoodProviderHexes  = _foodHexes.AsDeferredJobArray(),
                SleepProviderHexes = _sleepHexes.AsDeferredJobArray(),
                HealProviderHexes  = healHexes,
                Wildlife           = _wildlifeHexes.AsDeferredJobArray(),
                FriendlyEmitters   = _emitters.AsDeferredJobArray(),
                ForageHexes        = _forageHexes.AsDeferredJobArray(),
                SpatialHash        = spatial.Hash,
            }.ScheduleParallel(prepHandle);

            capitalFootprint.Dispose(state.Dependency);
            healHexes.Dispose(state.Dependency);
        }

        static void EnsureCapacity(ref NativeList<int2> list, int needed)
        {
            if (list.Capacity < needed) list.Capacity = math.max(needed, list.Capacity * 2);
        }

        static void EnsureCapacity(ref NativeList<TerritoryEmitter> list, int needed)
        {
            if (list.Capacity < needed) list.Capacity = math.max(needed, list.Capacity * 2);
        }

        [BurstCompile]
        struct ClearListsJob : IJob
        {
            public NativeList<int2>             Food;
            public NativeList<int2>             Sleep;
            public NativeList<int2>             Wildlife;
            public NativeList<int2>             Forage;
            public NativeList<TerritoryEmitter> Emitters;

            public void Execute()
            {
                Food.Clear();
                Sleep.Clear();
                Wildlife.Clear();
                Forage.Clear();
                Emitters.Clear();
            }
        }

        [BurstCompile]
        [WithAll(typeof(ProvidesFood))]
        partial struct BuildFoodHexesJob : IJobEntity
        {
            public NativeList<int2>.ParallelWriter Writer;

            void Execute(in Building b)
            {
                Writer.AddNoResize(b.RootHex);
                if (b.Type == BuildingType.Capital)
                {
                    Writer.AddNoResize(b.RootHex + new int2( 1,  0));
                    Writer.AddNoResize(b.RootHex + new int2( 1, -1));
                    Writer.AddNoResize(b.RootHex + new int2( 0, -1));
                    Writer.AddNoResize(b.RootHex + new int2(-1,  0));
                    Writer.AddNoResize(b.RootHex + new int2(-1,  1));
                    Writer.AddNoResize(b.RootHex + new int2( 0,  1));
                }
            }
        }

        [BurstCompile]
        [WithAll(typeof(ProvidesSleep))]
        partial struct BuildSleepHexesJob : IJobEntity
        {
            public NativeList<int2>.ParallelWriter Writer;

            void Execute(in Building b)
            {
                Writer.AddNoResize(b.RootHex);
                if (b.Type == BuildingType.Capital)
                {
                    Writer.AddNoResize(b.RootHex + new int2( 1,  0));
                    Writer.AddNoResize(b.RootHex + new int2( 1, -1));
                    Writer.AddNoResize(b.RootHex + new int2( 0, -1));
                    Writer.AddNoResize(b.RootHex + new int2(-1,  0));
                    Writer.AddNoResize(b.RootHex + new int2(-1,  1));
                    Writer.AddNoResize(b.RootHex + new int2( 0,  1));
                }
            }
        }

        [BurstCompile]
        [WithAll(typeof(PassiveAnimalTag))]
        [WithNone(typeof(TamedTag))]
        partial struct BuildWildlifeHexesJob : IJobEntity
        {
            public NativeList<int2>.ParallelWriter Writer;

            void Execute(in UnitMovement m)
            {
                Writer.AddNoResize(m.CurrentHex);
            }
        }

        [BurstCompile]
        partial struct BuildEmittersJob : IJobEntity
        {
            public NativeList<TerritoryEmitter>.ParallelWriter Writer;

            void Execute(in TerritoryEmitter e)
            {
                if (e.Radius == 0) return;
                if (e.OwnerFaction != FactionType.Player) return;
                Writer.AddNoResize(e);
            }
        }

        [BurstCompile]
        partial struct BuildForageHexesJob : IJobEntity
        {
            public NativeList<int2>.ParallelWriter Writer;

            void Execute(in HexResources r, in HexCoord c)
            {
                if ((r.Berries | r.Mushrooms | r.Herbs | r.Cactus
                    | r.Wood | r.Leaves | r.Branches) == 0) return;
                Writer.AddNoResize(new int2(c.Q, c.R));
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
