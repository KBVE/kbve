using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Picks the highest-priority profession with nearby work for each Player unit; writes ProfessionIntent. If no scored offer wins, assigns ProfessionKind.Default and rolls a Wander MovementGoal so units never sit idle. Reads the dispatch context + TaskOffer pool from ProfessionOffersSingleton (rebuilt on cadence by ProfessionOfferBuildSystem). Emits ProfessionChangedMessage via ProfessionEventSink on any kind/target change — coalesced + published by ProfessionMessagePipeBridgeSystem. Per-unit scoring runs as a [BurstCompile] IJobEntity parallel job — the main thread builds the snapshot inputs (occupancy / activePerKind / reservedPerKind / WriteBuffer capacity), schedules ScheduleParallel, and publishes the handle through ProfessionsDBSingleton.PipelineHandle so downstream consumers chain on it instead of forcing a sync.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ReliefSystem))]
    [UpdateAfter(typeof(ProfessionsDomainSystem))]
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

        NativeHashMap<int2, int> _hexOccupancy;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<ProfessionOffersSingleton>();
            state.RequireForUpdate<CombatDBSingleton>();
            state.RequireForUpdate<ItemDBSingleton>();
            state.RequireForUpdate<ProfessionsDBSingleton>();

            _hexOccupancy = new NativeHashMap<int2, int>(4096, Allocator.Persistent);
        }

        public void OnDestroy(ref SystemState state)
        {
            if (_hexOccupancy.IsCreated) _hexOccupancy.Dispose();
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

            // CombatThreatScanSystem fills threats / friendlyEmitters via a
            // parallel job; chain on its handle so the dispatch job sees a
            // consistent snapshot without a main-thread sync.
            state.Dependency = JobHandle.CombineDependencies(state.Dependency, combatDB.PipelineHandle);

            bool doFullDispatch = offersDB.BuildVersion != _lastSeenBuildVersion;
            if (doFullDispatch)
                _lastSeenBuildVersion = offersDB.BuildVersion;

            ref var dbRef = ref SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW;
            var writeBuffer = dbRef.WriteBuffer;

            // activePerKind / reservedPerKind / occupancy build runs on the
            // main thread when a full dispatch tick fires. Cheap O(units +
            // reserved-role entities), no per-unit cost in the inner loop.
            var activePerKind   = new NativeArray<int>(ProfessionKind.Count, Allocator.TempJob);
            var reservedPerKind = new NativeArray<int>(ProfessionKind.Count, Allocator.TempJob);

            if (doFullDispatch)
            {
                state.CompleteDependency();
                _hexOccupancy.Clear();

                foreach (var jobRO in
                         SystemAPI.Query<RefRO<ProfessionIntent>>().WithAll<ProfessionPriorities>())
                {
                    byte ak = jobRO.ValueRO.Kind;
                    if (CountsTowardHexOccupancy(ak))
                    {
                        var hex = jobRO.ValueRO.TargetHex;
                        _hexOccupancy[hex] = _hexOccupancy.TryGetValue(hex, out var c0) ? c0 + 1 : 1;
                    }
                    if (ak < activePerKind.Length) activePerKind[ak]++;
                }

                foreach (var reservedRO in SystemAPI.Query<RefRO<ReservedRoles>>())
                {
                    var r = reservedRO.ValueRO;
                    reservedPerKind[ProfessionKind.Lumberjack] += r.Lumberjack;
                    reservedPerKind[ProfessionKind.Miner]      += r.Miner;
                    reservedPerKind[ProfessionKind.Guard]      += r.Guard;
                    reservedPerKind[ProfessionKind.Looter]     += r.Looter;
                    reservedPerKind[ProfessionKind.Farmer]     += r.Farmer;
                    reservedPerKind[ProfessionKind.Builder]    += r.Builder;
                    reservedPerKind[ProfessionKind.Chef]       += r.Chef;
                    reservedPerKind[ProfessionKind.Hunter]     += r.Hunter;
                    reservedPerKind[ProfessionKind.Blacksmith] += r.Blacksmith;
                    reservedPerKind[ProfessionKind.Craftsman]  += r.Craftsman;
                    reservedPerKind[ProfessionKind.Medic]      += r.Medic;
                }
            }

            // Pre-allocate WriteBuffer headroom so AddNoResize is safe under
            // ParallelWriter contention. Worst case = one event per unit per
            // dispatch tick (Relief / Manual / Preempt / Retarget / Fallback
            // are exclusive paths). The query count is an upper bound; we
            // never trim, the bridge consumes the buffer next frame.
            var unitQuery = SystemAPI.QueryBuilder()
                .WithAll<ProfessionPriorities, ReliefIntent, ProfessionIntent, UnitMovement, LocalTransform, MovementGoal, TaskMemory>()
                .Build();
            int unitCount = unitQuery.CalculateEntityCount();
            int requiredCapacity = writeBuffer.Length + unitCount;
            if (writeBuffer.Capacity < requiredCapacity)
                writeBuffer.SetCapacity(math.max(requiredCapacity, writeBuffer.Capacity * 2));

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
                ActivePerKind    = activePerKind,
                ReservedPerKind  = reservedPerKind,

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
                NowTick          = (uint)SystemAPI.Time.ElapsedTime,
            };

            state.Dependency = job.ScheduleParallel(state.Dependency);

            // Publish the dispatch handle so the bridge system + any other
            // ProfessionIntent reader can chain on it without forcing the
            // main thread to sync here.
            dbRef.PipelineHandle = state.Dependency;

            activePerKind.Dispose(state.Dependency);
            reservedPerKind.Dispose(state.Dependency);
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
            [ReadOnly] public NativeArray<FriendlyEmitter> FriendlyEmitters;

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
                if (reliefIntent.Kind != ReliefKind.None)
                {
                    if (tasks.Length > 0)
                    {
                        var head = tasks[0];
                        if (head.State == TaskState.Active)
                        {
                            head.State = TaskState.Pending;
                            tasks[0]   = head;
                        }
                    }
                    var prev = intent;
                    if (prev.Kind != ProfessionKind.None)
                    {
                        intent = default;
                        ProfessionEventSink.Add(ref Events, entity, prev.Kind, ProfessionKind.None, default, Entity.Null, NowTick, ProfessionChangeReason.ReliefOverride);
                    }
                    return;
                }

                if (ControlledLookup.HasComponent(entity))
                {
                    if (tasks.Length > 0) tasks.Clear();
                    var prev = intent;
                    if (prev.Kind != ProfessionKind.None)
                    {
                        intent = default;
                        ProfessionEventSink.Add(ref Events, entity, prev.Kind, ProfessionKind.None, default, Entity.Null, NowTick, ProfessionChangeReason.ManualOverride);
                    }
                    return;
                }

                while (tasks.Length > 0 &&
                       (tasks[0].State == TaskState.Invalidated ||
                        tasks[0].State == TaskState.Completed))
                {
                    tasks.RemoveAt(0);
                }

                if (tasks.Length > 0)
                {
                    var head = tasks[0];
                    if (head.State == TaskState.Pending)
                    {
                        head.State = TaskState.Active;
                        tasks[0]   = head;
                        intent = new ProfessionIntent
                        {
                            Kind         = head.Kind,
                            TargetHex    = head.TargetHex,
                            TargetEntity = head.TargetEntity,
                        };
                        return;
                    }
                    if (AnyHostile
                        && head.State == TaskState.Active
                        && head.Kind != ProfessionKind.Guard
                        && priorities.Guard >= GuardPreemptThreshold
                        && TryFindClosestThreat(Threats, transform.Position,
                                                out var preemptHex, out var preemptHostile, out _))
                    {
                        tasks.Clear();
                        var preemptedIntent = intent;
                        intent = new ProfessionIntent
                        {
                            Kind         = ProfessionKind.Guard,
                            TargetHex    = preemptHex,
                            TargetEntity = preemptHostile,
                        };
                        tasks.Add(new TaskMemory
                        {
                            Kind         = ProfessionKind.Guard,
                            TargetHex    = preemptHex,
                            TargetEntity = preemptHostile,
                            State        = TaskState.Active,
                            IssuedTick   = NowTick,
                        });
                        if (preemptedIntent.Kind != ProfessionKind.Guard)
                            ProfessionEventSink.Add(ref Events, entity, preemptedIntent.Kind, ProfessionKind.Guard, preemptHex, preemptHostile, NowTick, ProfessionChangeReason.Preempted);
                        return;
                    }
                    if (head.State == TaskState.Active)
                        return;
                }

                if (!DoFullDispatch) return;

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
                    int    hostileDist   = int.MaxValue;
                    bool   foundHostile  = false;
                    if (AnyHostile && p.Guard >= GuardPreemptThreshold)
                    {
                        foundHostile = TryFindClosestThreat(
                            Threats, transform.Position,
                            out hostileHex, out hostileEntity, out hostileDist);
                    }

                    int guardReservationShortfall = math.max(0, ReservedPerKind[ProfessionKind.Guard] - ActivePerKind[ProfessionKind.Guard]);

                    if (foundHostile)
                    {
                        long gScore = (long)p.Guard * PriorityWeight - (long)hostileDist;
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
            out int2 outHex, out Entity outEntity, out int outDist)
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
                outDist   = (int)math.round(math.sqrt(inBestSq));
                return true;
            }

            if (bestEntity == Entity.Null)
            {
                outHex = default; outEntity = Entity.Null; outDist = int.MaxValue;
                return false;
            }

            outHex    = bestHex;
            outEntity = bestEntity;
            outDist   = (int)math.round(math.sqrt(bestSq));
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
