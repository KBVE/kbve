using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Picks the highest-priority profession with nearby work for each Player unit; writes ProfessionIntent. If no scored offer wins, assigns ProfessionKind.Default and rolls a Wander MovementGoal so units never sit idle. Reads the dispatch context + TaskOffer pool from ProfessionOffersSingleton (rebuilt on cadence by ProfessionOfferBuildSystem). Emits ProfessionChangedMessage via ProfessionEventSink on any kind/target change — coalesced + published by ProfessionMessagePipeBridgeSystem. ISystem + [BurstCompile] — every managed dependency routes through ComponentLookup / BufferLookup / Burst-safe singletons.</summary>
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

        uint _lastSeenBuildVersion;

        NativeHashMap<int2, int> _hexOccupancy;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<ProfessionOffersSingleton>();
            state.RequireForUpdate<CombatDBSingleton>();
            state.RequireForUpdate<ItemDBSingleton>();

            _hexOccupancy = new NativeHashMap<int2, int>(64, Allocator.Persistent);
        }

        public void OnDestroy(ref SystemState state)
        {
            if (_hexOccupancy.IsCreated) _hexOccupancy.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            RunDispatch(ref state);
        }

        [BurstCompile]
        void RunDispatch(ref SystemState state)
        {
            var offersDB = SystemAPI.GetSingleton<ProfessionOffersSingleton>();
            var combatDB = SystemAPI.GetSingleton<CombatDBSingleton>();
            var itemDB   = SystemAPI.GetSingleton<ItemDBSingleton>();

            bool doFullDispatch = offersDB.BuildVersion != _lastSeenBuildVersion;
            if (doFullDispatch)
            {
                _lastSeenBuildVersion = offersDB.BuildVersion;
                state.CompleteDependency();
            }

            bool hasCapital     = offersDB.HasCapital;
            bool capitalHasFood = offersDB.CapitalHasFood;

            var offers        = offersDB.Offers;
            var offersPerKind = offersDB.OffersPerKind;
            var needyCaves    = offersDB.NeedyCaves;

            var threats          = combatDB.Threats;
            var friendlyEmitters = combatDB.FriendlyEmitters;
            bool anyHostile      = threats.Length > 0;

            var controlledLookup = SystemAPI.GetComponentLookup<ControlledUnitTag>(true);

            var justAssignedPerKind = new NativeArray<int>(13, Allocator.Temp);

            BufferLookup<PackSlot> unitPackLookup = default;
            NativeArray<int> activePerKind   = default;
            NativeArray<int> reservedPerKind = default;

            if (doFullDispatch)
            {
                unitPackLookup = SystemAPI.GetBufferLookup<PackSlot>(true);

                _hexOccupancy.Clear();

                activePerKind   = new NativeArray<int>(13, Allocator.Temp);
                reservedPerKind = new NativeArray<int>(13, Allocator.Temp);

                foreach (var jobRO in
                         SystemAPI.Query<RefRO<ProfessionIntent>>().WithAll<ProfessionPriorities>())
                {
                    byte ak = jobRO.ValueRO.Kind;
                    if (jobRO.ValueRO.Kind != ProfessionKind.None)
                        _hexOccupancy[jobRO.ValueRO.TargetHex] = _hexOccupancy.TryGetValue(jobRO.ValueRO.TargetHex, out var c0) ? c0 + 1 : 1;
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

            uint nowTick = (uint)SystemAPI.Time.ElapsedTime;

            var events = default(NativeList<ProfessionChangedMessage>);
            if (SystemAPI.HasSingleton<ProfessionsDBSingleton>())
                events = SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW.WriteBuffer;

            foreach (var (priorities, reliefIntent, jobIntentRef, movement, transform, goalRef, tasksRef, entity) in
                     SystemAPI.Query<
                         RefRO<ProfessionPriorities>,
                         RefRO<ReliefIntent>,
                         RefRW<ProfessionIntent>,
                         RefRO<UnitMovement>,
                         RefRO<LocalTransform>,
                         RefRW<MovementGoal>,
                         DynamicBuffer<TaskMemory>>().WithEntityAccess())
            {
                var tasks = tasksRef;

                if (reliefIntent.ValueRO.Kind != ReliefKind.None)
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
                    var prev = jobIntentRef.ValueRO;
                    if (prev.Kind != ProfessionKind.None)
                    {
                        jobIntentRef.ValueRW = default;
                        if (events.IsCreated)
                            ProfessionEventSink.Add(ref events, entity, prev.Kind, ProfessionKind.None, default, Entity.Null, nowTick, ProfessionChangeReason.ReliefOverride);
                    }
                    continue;
                }

                // Manually-driven units (King by default, or any
                // possessed goblin) skip job assignment — the player is
                // steering them, the AI shouldn't assign work in
                // parallel. Releasing control returns the unit to the
                // dispatcher next tick.
                if (controlledLookup.HasComponent(entity))
                {
                    if (tasks.Length > 0) tasks.Clear();
                    var prev = jobIntentRef.ValueRO;
                    if (prev.Kind != ProfessionKind.None)
                    {
                        jobIntentRef.ValueRW = default;
                        if (events.IsCreated)
                            ProfessionEventSink.Add(ref events, entity, prev.Kind, ProfessionKind.None, default, Entity.Null, nowTick, ProfessionChangeReason.ManualOverride);
                    }
                    continue;
                }

                // Queue reconciliation — pop drained/invalid heads, promote
                // Pending → Active, skip re-scoring when the Active head is
                // still valid (TaskInvalidationSystem is authoritative on
                // validity — we only react to state here).
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
                        jobIntentRef.ValueRW = new ProfessionIntent
                        {
                            Kind         = head.Kind,
                            TargetHex    = head.TargetHex,
                            TargetEntity = head.TargetEntity,
                        };
                        continue;
                    }
                    if (anyHostile
                        && head.State == TaskState.Active
                        && head.Kind != ProfessionKind.Guard
                        && priorities.ValueRO.Guard >= GuardPreemptThreshold
                        && TryFindClosestThreat(threats, transform.ValueRO.Position,
                                                out var preemptHex, out var preemptHostile, out _))
                    {
                        tasks.Clear();
                        var preemptedIntent = jobIntentRef.ValueRO;
                        jobIntentRef.ValueRW = new ProfessionIntent
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
                            IssuedTick   = nowTick,
                        });
                        if (events.IsCreated && preemptedIntent.Kind != ProfessionKind.Guard)
                            ProfessionEventSink.Add(ref events, entity, preemptedIntent.Kind, ProfessionKind.Guard, preemptHex, preemptHostile, nowTick, ProfessionChangeReason.Preempted);
                        if (ProfessionKind.Guard < justAssignedPerKind.Length) justAssignedPerKind[ProfessionKind.Guard]++;
                        continue;
                    }
                    if (head.State == TaskState.Active)
                    {
                        // Unit is committed — don't re-score. ProfessionIntent is
                        // already in sync (BuilderJobSystem may refine
                        // TargetHex between dispatcher runs, which is fine).
                        continue;
                    }
                }

                // Queue is empty / drained. Only re-score on dispatch
                // ticks; on idle ticks the unit simply waits.
                if (!doFullDispatch) continue;

                var p = priorities.ValueRO;
                var currentHex = movement.ValueRO.CurrentHex;
                var currentTarget = jobIntentRef.ValueRO.TargetEntity;

                byte  bestKind   = ProfessionKind.None;
                int2  bestHex    = currentHex;
                Entity bestEntity = Entity.Null;
                long  bestScore  = long.MinValue;

                // Per-unit Looter mode derives from inventory + global
                // state. Precomputed so the offer loop does a single
                // variant-bit test per Looter candidate instead of
                // re-checking inventory each time.
                bool carryingFood = unitPackLookup.HasBuffer(entity)
                                    && PackHasFood(itemDB, unitPackLookup[entity]);
                byte looterMode;
                if (carryingFood && needyCaves.Length > 0)
                    looterMode = OfferVariant.LooterDeliver;
                else if (!carryingFood && needyCaves.Length > 0 && capitalHasFood && hasCapital)
                    looterMode = OfferVariant.LooterFetch;
                else
                    looterMode = 0xFF;  // forage fallback

                for (int oi = 0; oi < offers.Length; oi++)
                {
                    var offer = offers[oi];
                    byte prio = p.Get(offer.Kind);
                    if (prio == 0) continue;

                    if (offer.Kind == ProfessionKind.Looter)
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
                            if (offer.Variant != OfferVariant.LooterForage) continue;
                        }
                    }

                    int dist = HexDistance(currentHex, offer.Hex);
                    if (dist > OfferDistanceCap(offer.Kind, offer.Variant)) continue;

                    if (IsHarvestVariant(offer.Kind, offer.Variant)
                        && _hexOccupancy.TryGetValue(offer.Hex, out var occ)
                        && occ >= HexClusterCap) continue;

                    long score = (long)prio * PriorityWeight - (long)dist;
                    if (offer.Target != Entity.Null && offer.Target == currentTarget)
                        score += HysteresisBonus;
                    if (offer.Kind < offersPerKind.Length)
                    {
                        int oN = offersPerKind[offer.Kind];
                        int aN = activePerKind[offer.Kind] + justAssignedPerKind[offer.Kind];
                        int rN = reservedPerKind[offer.Kind];
                        int deficit = oN - aN;
                        if (deficit > 0)
                            score += (long)math.min(deficit, DeficitCap) * (PriorityWeight / 4);
                        int reservationShortfall = rN - aN;
                        if (reservationShortfall > 0)
                            score += (long)math.min(reservationShortfall, DeficitCap) * PriorityWeight;
                        float pressure = (float)(oN + 1) / (float)(aN + 1);
                        score += (long)(math.log(1f + pressure) * 30f);
                    }

                    if (score > bestScore)
                    {
                        bestScore  = score;
                        bestKind   = offer.Kind;
                        bestHex    = offer.Hex;
                        bestEntity = offer.Target;
                    }
                }

                if (p.Guard > 0)
                {
                    int2   hostileHex    = default;
                    Entity hostileEntity = Entity.Null;
                    int    hostileDist   = int.MaxValue;
                    bool   foundHostile  = false;
                    if (anyHostile && p.Guard >= GuardPreemptThreshold)
                    {
                        foundHostile = TryFindClosestThreat(
                            threats, transform.ValueRO.Position,
                            out hostileHex, out hostileEntity, out hostileDist);
                    }

                    int guardReservationShortfall = math.max(0, reservedPerKind[ProfessionKind.Guard] - (activePerKind[ProfessionKind.Guard] + justAssignedPerKind[ProfessionKind.Guard]));

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
                    else if (friendlyEmitters.Length > 0 && p.Guard >= GuardPatrolThreshold)
                    {
                        // Patrol fallback — pick a random hex inside the
                        // Capital's territory disc. Seed mixes entity index
                        // + WanderStep so each unit picks a different target
                        // AND re-rolls on each arrival (WanderStep advances
                        // when UnitMovementSystem snaps to the new hex).
                        var e = friendlyEmitters[0];
                        uint rng = (uint)entity.Index * 0x9E3779B1u
                                 ^ movement.ValueRO.WanderStep * 0x85EBCA77u;
                        rng ^= rng >> 13; rng *= 0xC2B2AE3Du; rng ^= rng >> 16;
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

                var prevIntent = jobIntentRef.ValueRO;
                var oldTarget  = prevIntent.TargetHex;
                if (_hexOccupancy.TryGetValue(oldTarget, out var oldCount) && oldCount > 0)
                    _hexOccupancy[oldTarget] = oldCount - 1;

                if (bestKind == ProfessionKind.None)
                {
                    uint rng = (uint)entity.Index * 0x9E3779B1u ^ nowTick * 0x85EBCA77u;
                    rng ^= rng >> 13; rng *= 0xC2B2AE3Du; rng ^= rng >> 16;
                    int dir = (int)(rng % 6u);
                    rng ^= rng >> 7; rng *= 0x27D4EB2Fu;
                    int dist = (int)(3u + (rng % 3u));
                    bestHex    = movement.ValueRO.CurrentHex + HexMeshUtil.HexNeighbor(dir) * dist;
                    bestEntity = Entity.Null;
                    bestKind   = ProfessionKind.Default;

                    if (goalRef.ValueRO.Priority <= GoalPriority.Wander)
                    {
                        goalRef.ValueRW = new MovementGoal
                        {
                            Kind      = GoalKind.Wander,
                            Priority  = GoalPriority.Wander,
                            TargetHex = bestHex,
                        };
                    }
                }

                _hexOccupancy[bestHex] = _hexOccupancy.TryGetValue(bestHex, out var newCount) ? newCount + 1 : 1;

                jobIntentRef.ValueRW = new ProfessionIntent
                {
                    Kind         = bestKind,
                    TargetHex    = bestHex,
                    TargetEntity = bestEntity,
                };

                if (bestKind < justAssignedPerKind.Length) justAssignedPerKind[bestKind]++;

                if (events.IsCreated
                    && (prevIntent.Kind != bestKind
                        || !prevIntent.TargetHex.Equals(bestHex)
                        || prevIntent.TargetEntity != bestEntity))
                {
                    ProfessionChangeReason reason;
                    if (bestKind == ProfessionKind.Default)       reason = ProfessionChangeReason.Fallback;
                    else if (prevIntent.Kind == bestKind)         reason = ProfessionChangeReason.Retargeted;
                    else                                          reason = ProfessionChangeReason.Assigned;
                    ProfessionEventSink.Add(ref events, entity, prevIntent.Kind, bestKind, bestHex, bestEntity, nowTick, reason);
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
                            IssuedTick   = nowTick,
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
                            IssuedTick   = nowTick,
                        };
                    }
                }
            }

            if (activePerKind.IsCreated)   activePerKind.Dispose();
            if (reservedPerKind.IsCreated) reservedPerKind.Dispose();
            justAssignedPerKind.Dispose();
        }

        static bool PackHasFood(in ItemDBSingleton itemDB, DynamicBuffer<PackSlot> buf)
        {
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].Count == 0) continue;
                if (itemDB.EnergyValue(buf[i].ItemId) > 0f) return true;
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
                    if (variant == OfferVariant.LooterForage) return SearchRadius;
                    return int.MaxValue;
                default:
                    return int.MaxValue;
            }
        }

        static bool IsHarvestVariant(byte kind, byte variant)
        {
            return kind == ProfessionKind.Lumberjack
                || kind == ProfessionKind.Miner
                || (kind == ProfessionKind.Looter && variant == OfferVariant.LooterForage);
        }

        static bool TryFindClosestThreat(
            NativeList<ThreatRecord> threats,
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
