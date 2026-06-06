using Unity.Burst;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Entities;
using Unity.Jobs;
using Unity.Jobs.LowLevel.Unsafe;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Third phase of the split dispatcher pipeline (#11 from #11716) — runs after ProfessionTaskReconcileSystem and ProfessionPreemptSystem. Only acts on units left with an empty task queue, no controlled-unit override, and a doFullDispatch tick: scores TaskOffers against per-unit priorities, picks a best, writes ProfessionIntent + task head, and emits Assigned / Retargeted / Fallback events. Units that Reconcile committed (Active head) or Preempt re-targeted are skipped via the tasks.Length check — no chunk-level filtering needed. Pre-pass jobs (Clear / BuildActive / BuildReserved / Reduce) populate the singleton accumulators on worker threads before the scoring job starts.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionPreemptSystem))]
    [UpdateAfter(typeof(ProfessionOfferBuildSystem))]
    [UpdateAfter(typeof(CombatThreatScanSystem))]
    public partial struct ProfessionDispatchSystem : ISystem
    {
        const int  SearchRadius          = 12;
        const int  HexClusterCap         = 4;
        const byte GuardPreemptThreshold = 3;
        const byte GuardPatrolThreshold  = 4;

        const int PriorityWeight  = 10000;
        const int HysteresisBonus = 50;
        const int DeficitCap      = 2;
        const int CrowdingPenalty = 200;

        uint _lastSeenBuildVersion;

        NativeHashMap<int2, int>                    _hexOccupancy;
        NativeParallelMultiHashMap<int2, byte>      _occupancyMulti;
        NativeArray<int>                            _perThreadActive;
        NativeArray<int>                            _perThreadReserved;
        NativeArray<int>                            _activePerKind;
        NativeArray<int>                            _reservedPerKind;
        int                                         _threadSlotCount;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<ProfessionOffersSingleton>();
            state.RequireForUpdate<CombatDBSingleton>();
            state.RequireForUpdate<ItemDBSingleton>();
            state.RequireForUpdate<ProfessionsDBSingleton>();

            _hexOccupancy = new NativeHashMap<int2, int>(4096, Allocator.Persistent);

            _threadSlotCount   = JobsUtility.MaxJobThreadCount;
            _perThreadActive   = new NativeArray<int>(_threadSlotCount * ProfessionKind.Count, Allocator.Persistent);
            _perThreadReserved = new NativeArray<int>(_threadSlotCount * ProfessionKind.Count, Allocator.Persistent);
            _activePerKind     = new NativeArray<int>(ProfessionKind.Count, Allocator.Persistent);
            _reservedPerKind   = new NativeArray<int>(ProfessionKind.Count, Allocator.Persistent);

            _occupancyMulti = new NativeParallelMultiHashMap<int2, byte>(8192, Allocator.Persistent);
        }

        public void OnDestroy(ref SystemState state)
        {
            state.CompleteDependency();
            if (_hexOccupancy.IsCreated)      _hexOccupancy.Dispose();
            if (_occupancyMulti.IsCreated)    _occupancyMulti.Dispose();
            if (_perThreadActive.IsCreated)   _perThreadActive.Dispose();
            if (_perThreadReserved.IsCreated) _perThreadReserved.Dispose();
            if (_activePerKind.IsCreated)     _activePerKind.Dispose();
            if (_reservedPerKind.IsCreated)   _reservedPerKind.Dispose();
        }

        static bool CountsTowardHexOccupancy(byte kind)
        {
            return kind == ProfessionKind.Lumberjack
                || kind == ProfessionKind.Miner
                || kind == ProfessionKind.Looter;
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var offersDB = SystemAPI.GetSingleton<ProfessionOffersSingleton>();
            var combatDB = SystemAPI.GetSingleton<CombatDBSingleton>();
            var itemDB   = SystemAPI.GetSingleton<ItemDBSingleton>();

            state.Dependency = JobHandle.CombineDependencies(state.Dependency, combatDB.PipelineHandle);

            bool doFullDispatch = offersDB.BuildVersion != _lastSeenBuildVersion;
            if (doFullDispatch)
                _lastSeenBuildVersion = offersDB.BuildVersion;

            ref var dbRef = ref SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW;
            var writeBuffer = dbRef.WriteBuffer;

            if (doFullDispatch)
            {
                var clearJob = new ClearPrePassJob
                {
                    PerThreadActive   = _perThreadActive,
                    PerThreadReserved = _perThreadReserved,
                    Occupancy         = _hexOccupancy,
                    OccupancyMulti    = _occupancyMulti,
                };
                state.Dependency = clearJob.Schedule(state.Dependency);

                var buildActiveJob = new BuildActiveAndOccupancyJob
                {
                    PerThreadActive = _perThreadActive,
                    OccupancyWriter = _occupancyMulti.AsParallelWriter(),
                };
                var activeHandle = buildActiveJob.ScheduleParallel(state.Dependency);

                var buildReservedJob = new BuildReservedJob
                {
                    PerThreadReserved = _perThreadReserved,
                };
                var reservedHandle = buildReservedJob.ScheduleParallel(state.Dependency);

                var reduceJob = new ReducePrePassJob
                {
                    PerThreadActive   = _perThreadActive,
                    PerThreadReserved = _perThreadReserved,
                    ActivePerKind     = _activePerKind,
                    ReservedPerKind   = _reservedPerKind,
                    OccupancyMulti    = _occupancyMulti,
                    Occupancy         = _hexOccupancy,
                    ThreadSlotCount   = _threadSlotCount,
                };
                state.Dependency = reduceJob.Schedule(
                    JobHandle.CombineDependencies(activeHandle, reservedHandle));
            }

            var job = new DispatchJob
            {
                OffersPerKind      = offersDB.OffersPerKind,
                OffersSortedByKind = offersDB.OffersSortedByKind.AsArray(),
                OfferKindStart     = offersDB.OfferKindStart,
                OfferKindCount     = offersDB.OfferKindCount,
                NeedyCaves         = offersDB.NeedyCaves.AsArray(),

                Threats          = combatDB.Threats.AsArray(),
                FriendlyEmitters = combatDB.FriendlyEmitters.AsArray(),

                HexOccupancy     = _hexOccupancy,
                ActivePerKind    = _activePerKind,
                ReservedPerKind  = _reservedPerKind,

                ItemDefs         = itemDB.Defs,
                ItemValidBits    = itemDB.ValidBits,
                ItemMaxId        = itemDB.MaxItemId,

                ControlledLookup = SystemAPI.GetComponentLookup<ControlledUnitTag>(true),
                UnitPackLookup   = SystemAPI.GetBufferLookup<PackSlot>(true),

                Events           = writeBuffer.AsParallelWriter(),

                HasCapital       = offersDB.HasCapital,
                CapitalHasFood   = offersDB.CapitalHasFood,
                AnyHostile       = combatDB.Threats.Length > 0,
                DoFullDispatch   = doFullDispatch,
                NowTick          = (uint)(SystemAPI.Time.ElapsedTime * 1000d),
            };

            state.Dependency = job.ScheduleParallel(state.Dependency);

            dbRef.PipelineHandle = state.Dependency;
        }

        [BurstCompile]
        struct ClearPrePassJob : IJob
        {
            public NativeArray<int>                       PerThreadActive;
            public NativeArray<int>                       PerThreadReserved;
            public NativeHashMap<int2, int>               Occupancy;
            public NativeParallelMultiHashMap<int2, byte> OccupancyMulti;

            public void Execute()
            {
                for (int i = 0; i < PerThreadActive.Length; i++)   PerThreadActive[i] = 0;
                for (int i = 0; i < PerThreadReserved.Length; i++) PerThreadReserved[i] = 0;
                Occupancy.Clear();
                OccupancyMulti.Clear();
            }
        }

        [BurstCompile]
        [WithAll(typeof(ProfessionPriorities))]
        partial struct BuildActiveAndOccupancyJob : IJobEntity
        {
            [NativeDisableParallelForRestriction] public NativeArray<int> PerThreadActive;
            public NativeParallelMultiHashMap<int2, byte>.ParallelWriter OccupancyWriter;
            [NativeSetThreadIndex] internal int ThreadIndex;

            public void Execute(in ProfessionIntent intent)
            {
                byte k = intent.Kind;
                if (k < ProfessionKind.Count)
                {
                    int slot = ThreadIndex * ProfessionKind.Count + k;
                    PerThreadActive[slot] = PerThreadActive[slot] + 1;
                }
                if (k == ProfessionKind.Lumberjack
                 || k == ProfessionKind.Miner
                 || k == ProfessionKind.Looter)
                {
                    OccupancyWriter.Add(intent.TargetHex, 1);
                }
            }
        }

        [BurstCompile]
        partial struct BuildReservedJob : IJobEntity
        {
            [NativeDisableParallelForRestriction] public NativeArray<int> PerThreadReserved;
            [NativeSetThreadIndex] internal int ThreadIndex;

            public void Execute(in ReservedRoles r)
            {
                int b = ThreadIndex * ProfessionKind.Count;
                PerThreadReserved[b + ProfessionKind.Lumberjack] = PerThreadReserved[b + ProfessionKind.Lumberjack] + r.Lumberjack;
                PerThreadReserved[b + ProfessionKind.Miner]      = PerThreadReserved[b + ProfessionKind.Miner]      + r.Miner;
                PerThreadReserved[b + ProfessionKind.Guard]      = PerThreadReserved[b + ProfessionKind.Guard]      + r.Guard;
                PerThreadReserved[b + ProfessionKind.Looter]     = PerThreadReserved[b + ProfessionKind.Looter]     + r.Looter;
                PerThreadReserved[b + ProfessionKind.Farmer]     = PerThreadReserved[b + ProfessionKind.Farmer]     + r.Farmer;
                PerThreadReserved[b + ProfessionKind.Builder]    = PerThreadReserved[b + ProfessionKind.Builder]    + r.Builder;
                PerThreadReserved[b + ProfessionKind.Chef]       = PerThreadReserved[b + ProfessionKind.Chef]       + r.Chef;
                PerThreadReserved[b + ProfessionKind.Hunter]     = PerThreadReserved[b + ProfessionKind.Hunter]     + r.Hunter;
                PerThreadReserved[b + ProfessionKind.Blacksmith] = PerThreadReserved[b + ProfessionKind.Blacksmith] + r.Blacksmith;
                PerThreadReserved[b + ProfessionKind.Craftsman]  = PerThreadReserved[b + ProfessionKind.Craftsman]  + r.Craftsman;
                PerThreadReserved[b + ProfessionKind.Medic]      = PerThreadReserved[b + ProfessionKind.Medic]      + r.Medic;
            }
        }

        [BurstCompile]
        struct ReducePrePassJob : IJob
        {
            [ReadOnly] public NativeArray<int>                       PerThreadActive;
            [ReadOnly] public NativeArray<int>                       PerThreadReserved;
            public NativeArray<int>                                  ActivePerKind;
            public NativeArray<int>                                  ReservedPerKind;
            [ReadOnly] public NativeParallelMultiHashMap<int2, byte> OccupancyMulti;
            public NativeHashMap<int2, int>                          Occupancy;
            public int                                               ThreadSlotCount;

            public void Execute()
            {
                for (int k = 0; k < ProfessionKind.Count; k++)
                {
                    int sumActive = 0;
                    int sumReserved = 0;
                    for (int t = 0; t < ThreadSlotCount; t++)
                    {
                        int idx = t * ProfessionKind.Count + k;
                        sumActive   += PerThreadActive[idx];
                        sumReserved += PerThreadReserved[idx];
                    }
                    ActivePerKind[k]   = sumActive;
                    ReservedPerKind[k] = sumReserved;
                }

                var enumer = OccupancyMulti.GetEnumerator();
                while (enumer.MoveNext())
                {
                    var kvp = enumer.Current;
                    Occupancy[kvp.Key] = Occupancy.TryGetValue(kvp.Key, out var c) ? c + 1 : 1;
                }
            }
        }

        [BurstCompile]
        partial struct DispatchJob : IJobEntity
        {
            [ReadOnly] public NativeArray<int>       OffersPerKind;
            [ReadOnly] public NativeArray<TaskOffer> OffersSortedByKind;
            [ReadOnly] public NativeArray<int>       OfferKindStart;
            [ReadOnly] public NativeArray<int>       OfferKindCount;
            [ReadOnly] public NativeArray<NeedyCave> NeedyCaves;

            [ReadOnly] public NativeArray<ThreatRecord>    Threats;
            [ReadOnly] public NativeArray<TerritoryEmitter> FriendlyEmitters;

            [ReadOnly] public NativeHashMap<int2, int> HexOccupancy;
            [ReadOnly] public NativeArray<int>         ActivePerKind;
            [ReadOnly] public NativeArray<int>         ReservedPerKind;

            [ReadOnly] public NativeArray<ItemDefRuntime> ItemDefs;
            [ReadOnly] public NativeArray<ulong>          ItemValidBits;
            public ushort ItemMaxId;

            [ReadOnly] public ComponentLookup<ControlledUnitTag> ControlledLookup;
            [ReadOnly] public BufferLookup<PackSlot>             UnitPackLookup;

            public NativeList<ProfessionChangedMessage>.ParallelWriter Events;

            public bool HasCapital;
            public bool CapitalHasFood;
            public bool AnyHostile;
            public bool DoFullDispatch;
            public uint NowTick;

            public void Execute(
                Entity entity,
                in ProfessionPriorities priorities,
                in ReliefIntent reliefIntent,
                ref ProfessionIntent intent,
                in UnitMovement movement,
                in LocalTransform transform,
                ref MovementGoal goal,
                DynamicBuffer<TaskMemory> tasks)
            {

                if (reliefIntent.Kind != ReliefKind.None)   return;
                if (tasks.Length > 0)                       return;
                if (ControlledLookup.HasComponent(entity))  return;
                if (!DoFullDispatch)                        return;

                var p = priorities;
                var currentHex = movement.CurrentHex;
                var currentTarget = intent.TargetEntity;

                byte  bestKind   = ProfessionKind.None;
                int2  bestHex    = currentHex;
                Entity bestEntity = Entity.Null;
                long  bestScore  = long.MinValue;

                bool carryingFood = UnitPackLookup.HasBuffer(entity)
                                    && PackHasFood(ItemDefs, ItemValidBits, ItemMaxId, UnitPackLookup[entity]);
                byte looterMode;
                if (carryingFood && NeedyCaves.Length > 0)
                    looterMode = OfferVariant.LooterDeliver;
                else if (!carryingFood && NeedyCaves.Length > 0 && CapitalHasFood && HasCapital)
                    looterMode = OfferVariant.LooterFetch;
                else
                    looterMode = 0xFF;

                for (byte kind = ProfessionKind.Default; kind < ProfessionKind.Count; kind++)
                {
                    byte prio = p.Get(kind);
                    if (prio == 0) continue;

                    int kindStart = OfferKindStart[kind];
                    int kindCount = OfferKindCount[kind];
                    int oNk = OffersPerKind[kind];
                    int aNk = ActivePerKind[kind];
                    int rNk = ReservedPerKind[kind];
                    int deficit = oNk - aNk;
                    int reservationShortfall = rNk - aNk;
                    long deficitBonus = deficit > 0
                        ? (long)math.min(deficit, DeficitCap) * (PriorityWeight / 4)
                        : 0L;
                    long reservationBonus = reservationShortfall > 0
                        ? (long)math.min(reservationShortfall, DeficitCap) * PriorityWeight
                        : 0L;
                    float pressure = (float)(oNk + 1) / (float)(aNk + 1);
                    long pressureBonus = (long)(math.log(1f + pressure) * 30f);
                    long perKindBonus = deficitBonus + reservationBonus + pressureBonus;

                    for (int si = 0; si < kindCount; si++)
                    {
                        var offer = OffersSortedByKind[kindStart + si];

                        if (kind == ProfessionKind.Looter)
                        {
                            if (looterMode == OfferVariant.LooterDeliver)
                            {
                                if (offer.Variant != OfferVariant.LooterDeliver) continue;
                            }
                            else if (looterMode == OfferVariant.LooterFetch)
                            {
                                if (offer.Variant != OfferVariant.LooterFetch) continue;
                            }
                            else
                            {
                                if (offer.Variant != OfferVariant.LooterForage
                                    && offer.Variant != OfferVariant.LooterDropPickup) continue;
                            }
                        }

                        int dist = HexDistance(currentHex, offer.Hex);
                        if (dist > OfferDistanceCap(kind, offer.Variant)) continue;

                        int crowdOcc = 0;
                        if (IsHarvestVariant(kind, offer.Variant)
                            && HexOccupancy.TryGetValue(offer.Hex, out var occ))
                        {
                            if (occ >= HexClusterCap) continue;
                            crowdOcc = occ;
                        }

                        long score = (long)prio * PriorityWeight - (long)dist + perKindBonus;
                        if (crowdOcc > 0)
                            score -= (long)crowdOcc * crowdOcc * CrowdingPenalty;
                        if (offer.Target != Entity.Null && offer.Target == currentTarget)
                            score += HysteresisBonus;

                        if (score > bestScore)
                        {
                            bestScore  = score;
                            bestKind   = kind;
                            bestHex    = offer.Hex;
                            bestEntity = offer.Target;
                        }
                    }
                }

                if (p.Guard > 0)
                {
                    int2   hostileHex    = default;
                    Entity hostileEntity = Entity.Null;
                    bool   foundHostile  = false;
                    if (AnyHostile && p.Guard >= GuardPreemptThreshold)
                    {
                        foundHostile = TryFindClosestThreat(
                            Threats, transform.Position,
                            out hostileHex, out hostileEntity);
                    }

                    int guardReservationShortfall = math.max(0, ReservedPerKind[ProfessionKind.Guard] - ActivePerKind[ProfessionKind.Guard]);

                    if (foundHostile)
                    {
                        int hostileHexDist = HexDistance(currentHex, hostileHex);
                        long gScore = (long)p.Guard * PriorityWeight - (long)hostileHexDist;
                        if (hostileEntity != Entity.Null && hostileEntity == currentTarget)
                            gScore += HysteresisBonus;
                        if (guardReservationShortfall > 0)
                            gScore += (long)math.min(guardReservationShortfall, DeficitCap) * PriorityWeight;
                        if (gScore > bestScore)
                        {
                            bestScore  = gScore;
                            bestKind   = ProfessionKind.Guard;
                            bestHex    = hostileHex;
                            bestEntity = hostileEntity;
                        }
                    }
                    else if (FriendlyEmitters.Length > 0 && p.Guard >= GuardPatrolThreshold)
                    {
                        var e = FriendlyEmitters[0];
                        uint rng = UnitHashOps.Spread(in entity) ^ (movement.WanderStep * 0x85EBCA77u);
                        int span = e.Radius * 2 + 1;
                        int dq = (int)(rng % (uint)span) - e.Radius;
                        rng ^= rng >> 7; rng *= 0x27D4EB2Fu;
                        int dr = (int)(rng % (uint)span) - e.Radius;

                        while (AxialDistance(dq, dr) > e.Radius)
                        {
                            if (math.abs(dq) > math.abs(dr)) dq -= (int)math.sign(dq);
                            else                             dr -= (int)math.sign(dr);
                        }

                        int2 patrolHex = new int2(e.Center.x + dq, e.Center.y + dr);
                        int patrolDist = HexDistance(currentHex, patrolHex);

                        long gScore = (long)p.Guard * PriorityWeight - (long)patrolDist;
                        if (guardReservationShortfall > 0)
                            gScore += (long)math.min(guardReservationShortfall, DeficitCap) * PriorityWeight;
                        if (gScore > bestScore)
                        {
                            bestScore  = gScore;
                            bestKind   = ProfessionKind.Guard;
                            bestHex    = patrolHex;
                            bestEntity = Entity.Null;
                        }
                    }
                }

                var prevIntent = intent;

                if (bestKind == ProfessionKind.None)
                {
                    uint rng = UnitHashOps.Spread(in entity) ^ (NowTick * 0x85EBCA77u);
                    int dir = (int)(rng % 6u);
                    rng ^= rng >> 7; rng *= 0x27D4EB2Fu;
                    int dist = (int)(3u + (rng % 3u));
                    bestHex    = movement.CurrentHex + HexMeshUtil.HexNeighbor(dir) * dist;
                    bestEntity = Entity.Null;
                    bestKind   = ProfessionKind.Default;

                    if (goal.Priority <= GoalPriority.Wander)
                    {
                        goal = new MovementGoal
                        {
                            Kind      = GoalKind.Wander,
                            Priority  = GoalPriority.Wander,
                            TargetHex = bestHex,
                        };
                    }
                }

                intent = new ProfessionIntent
                {
                    Kind         = bestKind,
                    TargetHex    = bestHex,
                    TargetEntity = bestEntity,
                };

                if (prevIntent.Kind != bestKind
                    || !prevIntent.TargetHex.Equals(bestHex)
                    || prevIntent.TargetEntity != bestEntity)
                {
                    ProfessionChangeReason reason;
                    if (bestKind == ProfessionKind.Default)       reason = ProfessionChangeReason.Fallback;
                    else if (prevIntent.Kind == bestKind)         reason = ProfessionChangeReason.Retargeted;
                    else                                          reason = ProfessionChangeReason.Assigned;
                    ProfessionEventSink.Add(ref Events, entity, prevIntent.Kind, bestKind, bestHex, bestEntity, NowTick, reason);
                }

                if (bestKind == ProfessionKind.None || bestKind == ProfessionKind.Default)
                {
                    if (tasks.Length > 0) tasks.Clear();
                }
                else
                {
                    if (tasks.Length == 0)
                    {
                        tasks.Add(new TaskMemory
                        {
                            Kind         = bestKind,
                            TargetHex    = bestHex,
                            TargetEntity = bestEntity,
                            State        = TaskState.Active,
                            IssuedTick   = NowTick,
                        });
                    }
                    else
                    {
                        tasks[0] = new TaskMemory
                        {
                            Kind         = bestKind,
                            TargetHex    = bestHex,
                            TargetEntity = bestEntity,
                            State        = TaskState.Active,
                            IssuedTick   = NowTick,
                        };
                    }
                }
            }
        }

        static bool PackHasFood(
            NativeArray<ItemDefRuntime> defs,
            NativeArray<ulong>          validBits,
            ushort                      maxId,
            DynamicBuffer<PackSlot>     buf)
        {
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].Count == 0) continue;
                ushort id = buf[i].ItemId;
                if (id >= maxId) continue;
                if ((validBits[id >> 6] & (1ul << (id & 63))) == 0) continue;
                if (defs[id].RestoreEnergy > 0f) return true;
            }
            return false;
        }

        static int OfferDistanceCap(byte kind, byte variant)
        {
            switch (kind)
            {
                case ProfessionKind.Lumberjack:
                case ProfessionKind.Miner:
                    return SearchRadius;
                case ProfessionKind.Farmer:
                    return SearchRadius * 2;
                case ProfessionKind.Builder:
                    return variant == OfferVariant.BuilderDamaged ? SearchRadius * 2 : int.MaxValue;
                case ProfessionKind.Chef:
                case ProfessionKind.Craftsman:
                case ProfessionKind.Blacksmith:
                    return int.MaxValue;
                case ProfessionKind.Looter:
                    if (variant == OfferVariant.LooterForage)     return SearchRadius;
                    if (variant == OfferVariant.LooterDropPickup) return SearchRadius * 2;
                    return int.MaxValue;
                default:
                    return int.MaxValue;
            }
        }

        static bool IsHarvestVariant(byte kind, byte variant)
        {
            return kind == ProfessionKind.Lumberjack
                || kind == ProfessionKind.Miner
                || (kind == ProfessionKind.Looter
                    && (variant == OfferVariant.LooterForage
                     || variant == OfferVariant.LooterDropPickup));
        }

        static bool TryFindClosestThreat(
            NativeArray<ThreatRecord> threats,
            float3 originWorld,
            out int2 outHex, out Entity outEntity)
        {
            const float ScanRadiusSq = 6f * 6f;

            Entity bestEntity = Entity.Null, inBestEntity = Entity.Null;
            int2   bestHex    = default,     inBestHex    = default;
            float  bestSq     = float.MaxValue, inBestSq   = float.MaxValue;

            var origin = new float2(originWorld.x, originWorld.y);

            for (int i = 0; i < threats.Length; i++)
            {
                var t = threats[i];
                float d2 = math.distancesq(origin, t.Position);
                if (d2 > ScanRadiusSq) continue;

                if (d2 < bestSq)
                {
                    bestSq = d2; bestHex = t.Hex; bestEntity = t.Entity;
                }
                if (t.InsideFriendlyTerritory && d2 < inBestSq)
                {
                    inBestSq = d2; inBestHex = t.Hex; inBestEntity = t.Entity;
                }
            }

            if (inBestEntity != Entity.Null)
            {
                outHex    = inBestHex;
                outEntity = inBestEntity;
                return true;
            }

            if (bestEntity == Entity.Null)
            {
                outHex = default; outEntity = Entity.Null;
                return false;
            }

            outHex    = bestHex;
            outEntity = bestEntity;
            return true;
        }

        static int AxialDistance(int dq, int dr)
        {
            int ds = -dq - dr;
            return (math.abs(dq) + math.abs(dr) + math.abs(ds)) / 2;
        }

        static int HexDistance(int2 a, int2 b) => AxialDistance(b.x - a.x, b.y - a.y);
    }
}
