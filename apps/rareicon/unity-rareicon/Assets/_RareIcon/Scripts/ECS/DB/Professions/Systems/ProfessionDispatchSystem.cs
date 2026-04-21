using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Transforms;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Owns the ProfessionsDBSingleton lifecycle: bootstraps the CommittedEvents list on first tick, clears it per frame, disposes on teardown. Runs in BehaviorSystemGroup OrderFirst so the dispatcher downstream sees an empty list.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup), OrderFirst = true)]
    public partial class ProfessionsDomainSystem : SystemBase
    {
        Entity _singleton;
        bool   _initialized;

        protected override void OnUpdate()
        {
            if (!_initialized)
            {
                var db = new ProfessionsDBSingleton
                {
                    CommittedEvents = new NativeList<ProfessionChangedMessage>(64, Allocator.Persistent),
                    PipelineHandle  = default,
                };
                _singleton = EntityManager.CreateEntity(typeof(ProfessionsDBSingleton));
                EntityManager.SetName(_singleton, "ProfessionsDB");
                EntityManager.SetComponentData(_singleton, db);
                _initialized = true;
            }

            ref var live = ref SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW;
            live.PipelineHandle.Complete();
            live.CommittedEvents.Clear();
            live.PipelineHandle = default;
        }

        protected override void OnDestroy()
        {
            if (!_initialized) return;
            if (!EntityManager.Exists(_singleton)) return;
            var db = EntityManager.GetComponentData<ProfessionsDBSingleton>(_singleton);
            if (db.CommittedEvents.IsCreated) db.CommittedEvents.Dispose();
        }
    }

    /// <summary>Drains ProfessionsDBSingleton.CommittedEvents each frame and publishes via IPublisher&lt;ProfessionChangedMessage&gt;. Runs after ProfessionDispatchSystem so all per-frame intent changes are captured before the list resets.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionDispatchSystem))]
    public partial class ProfessionMessagePipeBridgeSystem : SystemBase
    {
        IPublisher<ProfessionChangedMessage> _publisher;

        protected override void OnCreate()
        {
            RequireForUpdate<ProfessionsDBSingleton>();
        }

        protected override void OnUpdate()
        {
            ref var db = ref SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW;

            db.PipelineHandle.Complete();

            var list = db.CommittedEvents;
            if (!list.IsCreated || list.Length == 0) return;

            if (_publisher == null)
            {
                try { _publisher = GlobalMessagePipe.GetPublisher<ProfessionChangedMessage>(); }
                catch { return; }
            }

            for (int i = 0; i < list.Length; i++)
                _publisher.Publish(list[i]);

            list.Clear();
        }
    }
}

namespace RareIcon
{
    /// <summary>Picks the highest-priority profession with nearby work for each Player unit; writes ProfessionIntent. If no scored offer wins, assigns ProfessionKind.Default and rolls a Wander MovementGoal so units never sit idle. Appends a ProfessionChangedMessage to ProfessionsDBSingleton.CommittedEvents on any kind/target change — drained by ProfessionMessagePipeBridgeSystem.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ReliefSystem))]
    [UpdateAfter(typeof(ProfessionsDomainSystem))]
    public partial class ProfessionDispatchSystem : SystemBase
    {
        const int SearchRadius   = 12;
        const int HexClusterCap  = 4;

        // Unified score coefficients. PriorityWeight >> max-distance so
        // higher priority always beats lower (preserves the old prio
        // cascade). Distance is the second sort key. HysteresisBonus is
        // a small nudge so a unit re-scoring to an offer identical to
        // its current ProfessionIntent target wins against marginally-closer
        // alternatives — relevant when the queue drains and refills.
        const int   PriorityWeight           = 10000;
        const int   HysteresisBonus          = 50;
        const int   DeficitCap               = 2;
        const float DispatchIntervalSeconds  = 5f;

        float _lastDispatchTime = -DispatchIntervalSeconds;

        NativeHashMap<int2, int> _hexOccupancy;

        const double DiagIntervalSeconds = 30.0;
        double _nextDiagTime = 3.0;

        protected override void OnDestroy()
        {
            if (_hexOccupancy.IsCreated) _hexOccupancy.Dispose();
            base.OnDestroy();
        }

        protected override void OnUpdate()
        {
            RunDispatch();

            if (SystemAPI.Time.ElapsedTime >= _nextDiagTime)
            {
                _nextDiagTime = SystemAPI.Time.ElapsedTime + DiagIntervalSeconds;
                LogDispatchDiagnostic();
            }
        }

        void RunDispatch()
        {
            // We do main-thread reads on InventorySlot (cave + Capital food
            // counts) below. Background jobs like FurnaceTickJob schedule
            float now = (float)SystemAPI.Time.ElapsedTime;
            bool doFullDispatch = (now - _lastDispatchTime) >= DispatchIntervalSeconds;
            if (doFullDispatch)
            {
                _lastDispatchTime = now;
                CompleteDependency();
            }

            SystemAPI.TryGetSingleton<SpatialHashSingleton>(out var spatial);

            bool anyHostile = false;
            foreach (var f in SystemAPI.Query<RefRO<Faction>>())
            {
                byte fv = f.ValueRO.Value;
                if (fv == FactionType.Hostile || fv == FactionType.Beast) { anyHostile = true; break; }
            }

            bool hasCapital = SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital);
            int2 capitalHex = default;
            if (hasCapital) capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;

            Entity nearestFarm = Entity.Null;
            int2   farmHex     = default;
            bool   hasFarm     = false;
            foreach (var (b, e) in SystemAPI.Query<RefRO<Building>>().WithEntityAccess().WithAll<FarmTag>())
            {
                nearestFarm = e;
                farmHex     = b.ValueRO.RootHex;
                hasFarm     = true;
                break;
            }

            using var siteQuery = EntityManager.CreateEntityQuery(ComponentType.ReadOnly<ConstructionSite>());
            using var sites = siteQuery.ToEntityArray(Allocator.Temp);

            // Damaged Player buildings are repair candidates for the same
            // Builder priority — collected once per tick so per-unit
            // scoring below doesn't requery. Filter excludes
            // ConstructionSite entities so we don't double-count
            // incomplete builds (they're already in `sites`).
            using var damagedQuery = EntityManager.CreateEntityQuery(
                new EntityQueryDesc
                {
                    All  = new[] { ComponentType.ReadOnly<Building>(), ComponentType.ReadOnly<BuildingHealth>() },
                    None = new[] { ComponentType.ReadOnly<ConstructionSite>() },
                });
            using var damagedCandidates = damagedQuery.ToEntityArray(Allocator.Temp);

            // Ground arrows the Looter job can reclaim. Read the transforms
            // up front so the per-unit scoring loop doesn't re-query each
            // entity's LocalTransform.
            using var groundArrowQuery = EntityManager.CreateEntityQuery(
                ComponentType.ReadOnly<GroundArrow>(),
                ComponentType.ReadOnly<LocalTransform>());
            using var groundArrows = groundArrowQuery.ToEntityArray(Allocator.Temp);

            // Snapshot friendly territory emitters so Archers can prioritise
            // hostiles that stepped across the border. Single Capital in MVP
            // → array length == 1 → the per-unit check stays O(1).
            var friendlyEmitters = new NativeList<TerritoryEmitter>(4, Allocator.Temp);
            foreach (var e in SystemAPI.Query<RefRO<TerritoryEmitter>>())
            {
                if (e.ValueRO.Radius == 0) continue;
                if (e.ValueRO.OwnerFaction != FactionType.Player) continue;
                friendlyEmitters.Add(e.ValueRO);
            }

            // Caves that need food — Looters haul Capital → cave. Collected
            // once per tick so the per-unit scoring loop stays linear.
            // Storing (entity, hex, headroom) keeps the inner scoring
            // independent of the cave's live storage buffer.
            var needyCaves = new NativeList<NeedyCave>(4, Allocator.Temp);
            {
                var caveInvLookup = SystemAPI.GetBufferLookup<GoblinCaveLedger>(true);
                foreach (var (prodRO, buildingRO, e) in
                         SystemAPI.Query<RefRO<GoblinCaveProduction>, RefRO<Building>>()
                                  .WithAll<GoblinCaveTag>()
                                  .WithEntityAccess())
                {
                    if (!caveInvLookup.HasBuffer(e)) continue;
                    ushort cap = prodRO.ValueRO.StorageCap == 0 ? (ushort)200 : prodRO.ValueRO.StorageCap;
                    int food  = CountFood(caveInvLookup[e].Reinterpret<BankLedgerBase>());
                    if (food >= cap) continue;
                    needyCaves.Add(new NeedyCave { Entity = e, Hex = buildingRO.ValueRO.RootHex });
                }
            }

            // Does Capital actually have food to ship? If not, sending a
            // Looter there is busywork — let them go forage instead.
            bool capitalHasFood = false;
            if (hasCapital && EntityManager.HasBuffer<CapitalLedger>(capital))
            {
                var capInv = EntityManager.GetBuffer<CapitalLedger>(capital);
                for (int i = 0; i < capInv.Length; i++)
                {
                    if (capInv[i].Count == 0) continue;
                    if (ItemDB.EnergyValue(capInv[i].ItemId) > 0f) { capitalHasFood = true; break; }
                }
            }

            var unitPackLookup = SystemAPI.GetBufferLookup<PackSlot>(true);

            if (!_hexOccupancy.IsCreated)
                _hexOccupancy = new NativeHashMap<int2, int>(64, Allocator.Persistent);
            else
                _hexOccupancy.Clear();
            foreach (var jobRO in
                     SystemAPI.Query<RefRO<ProfessionIntent>>().WithAll<ProfessionPriorities>())
            {
                if (jobRO.ValueRO.Kind == ProfessionKind.None) continue;
                var th = jobRO.ValueRO.TargetHex;
                _hexOccupancy[th] = _hexOccupancy.TryGetValue(th, out var c0) ? c0 + 1 : 1;
            }

            // ─── Offer enumeration ───
            // Single world-level pass builds the pool of candidate jobs.
            // Per-unit scoring walks this flat list instead of re-querying
            // the world per unit. Guard stays inline below because hostile
            // lookup is spatial from the unit's position, and patrol
            // fallback is a per-unit RNG roll. Skipped on non-dispatch
            // ticks — the per-unit loop short-circuits for queue-empty
            // units in those frames.
            var offers = new NativeList<TaskOffer>(doFullDispatch ? 256 : 0, Allocator.Temp);
            var offersPerKind       = new NativeArray<int>(13, Allocator.Temp);
            var activePerKind       = new NativeArray<int>(13, Allocator.Temp);
            var reservedPerKind     = new NativeArray<int>(13, Allocator.Temp);
            var justAssignedPerKind = new NativeArray<int>(13, Allocator.Temp);
            foreach (var jobRO in SystemAPI.Query<RefRO<ProfessionIntent>>().WithAll<ProfessionPriorities>())
            {
                byte ak = jobRO.ValueRO.Kind;
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

            if (doFullDispatch)
            {
                foreach (var (resRO, coordRO) in
                         SystemAPI.Query<RefRO<HexResources>, RefRO<HexCoord>>())
                {
                    var res = resRO.ValueRO;
                    var hex = new int2(coordRO.ValueRO.Q, coordRO.ValueRO.R);

                    if ((res.Wood | res.Leaves | res.Branches) != 0)
                        offers.Add(new TaskOffer { Kind = ProfessionKind.Lumberjack, Variant = OfferVariant.Default, Hex = hex });
                    if (res.Stone != 0)
                        offers.Add(new TaskOffer { Kind = ProfessionKind.Miner, Variant = OfferVariant.Default, Hex = hex });
                    if ((res.Berries | res.Mushrooms | res.Herbs | res.Cactus) != 0)
                        offers.Add(new TaskOffer { Kind = ProfessionKind.Looter, Variant = OfferVariant.LooterForage, Hex = hex });
                }

                if (hasFarm)
                    offers.Add(new TaskOffer { Kind = ProfessionKind.Farmer, Variant = OfferVariant.Default, Hex = farmHex, Target = nearestFarm });

                for (int si = 0; si < sites.Length; si++)
                {
                    var site = EntityManager.GetComponentData<ConstructionSite>(sites[si]);
                    offers.Add(new TaskOffer { Kind = ProfessionKind.Builder, Variant = OfferVariant.BuilderSite, Hex = site.RootHex, Target = sites[si] });
                }

                for (int di = 0; di < damagedCandidates.Length; di++)
                {
                    var bd = EntityManager.GetComponentData<Building>(damagedCandidates[di]);
                    if (bd.OwnerFaction != FactionType.Player) continue;
                    var hp = EntityManager.GetComponentData<BuildingHealth>(damagedCandidates[di]);
                    if (hp.Value >= hp.Max) continue;
                    offers.Add(new TaskOffer { Kind = ProfessionKind.Builder, Variant = OfferVariant.BuilderDamaged, Hex = bd.RootHex, Target = damagedCandidates[di] });
                }

                if (hasCapital)
                    offers.Add(new TaskOffer { Kind = ProfessionKind.Chef, Variant = OfferVariant.Default, Hex = capitalHex, Target = capital });

                foreach (var (barrackBuilding, barrackEntity) in
                         SystemAPI.Query<RefRO<Building>>().WithAll<BarracksTag>().WithEntityAccess())
                {
                    offers.Add(new TaskOffer
                    {
                        Kind    = ProfessionKind.Craftsman,
                        Variant = OfferVariant.Default,
                        Hex     = barrackBuilding.ValueRO.RootHex,
                        Target  = barrackEntity,
                    });
                }

                foreach (var (furnaceBuilding, furnaceEntity) in
                         SystemAPI.Query<RefRO<Building>>().WithAll<FurnaceTag>().WithEntityAccess())
                {
                    offers.Add(new TaskOffer
                    {
                        Kind    = ProfessionKind.Blacksmith,
                        Variant = OfferVariant.Default,
                        Hex     = furnaceBuilding.ValueRO.RootHex,
                        Target  = furnaceEntity,
                    });
                }

                for (int ci = 0; ci < needyCaves.Length; ci++)
                    offers.Add(new TaskOffer { Kind = ProfessionKind.Looter, Variant = OfferVariant.LooterDeliver, Hex = needyCaves[ci].Hex, Target = needyCaves[ci].Entity });

                if (hasCapital && capitalHasFood && needyCaves.Length > 0)
                    offers.Add(new TaskOffer { Kind = ProfessionKind.Looter, Variant = OfferVariant.LooterFetch, Hex = capitalHex, Target = capital });

                for (int ai = 0; ai < groundArrows.Length; ai++)
                {
                    var t  = EntityManager.GetComponentData<LocalTransform>(groundArrows[ai]);
                    var ah = HexMeshUtil.WorldToHex(t.Position.x, t.Position.y, 0.25f);
                    offers.Add(new TaskOffer { Kind = ProfessionKind.Looter, Variant = OfferVariant.LooterArrow, Hex = ah, Target = groundArrows[ai] });
                }

                for (int oi = 0; oi < offers.Length; oi++)
                {
                    byte ok = offers[oi].Kind;
                    if (ok < offersPerKind.Length) offersPerKind[ok]++;
                }
            }

            uint nowTick = (uint)SystemAPI.Time.ElapsedTime;

            var events = default(NativeList<ProfessionChangedMessage>);
            if (SystemAPI.HasSingleton<ProfessionsDBSingleton>())
                events = SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW.CommittedEvents;

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
                // DynamicBuffer iteration variables come back as `ref readonly`
                // from the source-generated query (CS1654 on mutation). Copy
                // the handle to a mutable local — it still points to the same
                // underlying storage.
                var tasks = tasksRef;

                if (reliefIntent.ValueRO.Kind != ReliefKind.None)
                {
                    if (tasks.Length > 0) tasks.Clear();
                    var prev = jobIntentRef.ValueRO;
                    if (prev.Kind != ProfessionKind.None)
                    {
                        jobIntentRef.ValueRW = default;
                        if (events.IsCreated)
                            events.Add(new ProfessionChangedMessage(entity, prev.Kind, ProfessionKind.None, default, Entity.Null));
                    }
                    continue;
                }

                // Manually-driven units (King by default, or any
                // possessed goblin) skip job assignment — the player is
                // steering them, the AI shouldn't assign work in
                // parallel. Releasing control returns the unit to the
                // dispatcher next tick.
                if (EntityManager.HasComponent<ControlledUnitTag>(entity))
                {
                    if (tasks.Length > 0) tasks.Clear();
                    var prev = jobIntentRef.ValueRO;
                    if (prev.Kind != ProfessionKind.None)
                    {
                        jobIntentRef.ValueRW = default;
                        if (events.IsCreated)
                            events.Add(new ProfessionChangedMessage(entity, prev.Kind, ProfessionKind.None, default, Entity.Null));
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
                        && priorities.ValueRO.Guard > 0
                        && spatial.Hash.IsCreated
                        && TryFindHostile(spatial.Hash, transform.ValueRO.Position,
                                          friendlyEmitters.AsArray(),
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
                            events.Add(new ProfessionChangedMessage(entity, preemptedIntent.Kind, ProfessionKind.Guard, preemptHex, preemptHostile));
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
                                    && PackHasFood(unitPackLookup[entity]);
                byte looterMode;
                if (carryingFood && needyCaves.Length > 0)
                    looterMode = OfferVariant.LooterDeliver;
                else if (!carryingFood && needyCaves.Length > 0 && capitalHasFood && hasCapital)
                    looterMode = OfferVariant.LooterFetch;
                else
                    looterMode = 0xFF;  // arrows + forage fallback

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
                            if (offer.Variant != OfferVariant.LooterArrow
                                && offer.Variant != OfferVariant.LooterForage) continue;
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
                            score += (long)reservationShortfall * PriorityWeight;
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
                    if (spatial.Hash.IsCreated)
                    {
                        foundHostile = TryFindHostile(
                            spatial.Hash, transform.ValueRO.Position, friendlyEmitters.AsArray(),
                            out hostileHex, out hostileEntity, out hostileDist);
                    }

                    int guardReservationShortfall = math.max(0, reservedPerKind[ProfessionKind.Guard] - (activePerKind[ProfessionKind.Guard] + justAssignedPerKind[ProfessionKind.Guard]));

                    if (foundHostile)
                    {
                        long gScore = (long)p.Guard * PriorityWeight - (long)hostileDist;
                        if (hostileEntity != Entity.Null && hostileEntity == currentTarget)
                            gScore += HysteresisBonus;
                        if (guardReservationShortfall > 0)
                            gScore += (long)guardReservationShortfall * PriorityWeight;
                        if (gScore > bestScore)
                        {
                            bestScore  = gScore;
                            bestKind   = ProfessionKind.Guard;
                            bestHex    = hostileHex;
                            bestEntity = hostileEntity;
                        }
                    }
                    else if (friendlyEmitters.Length > 0)
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
                            gScore += (long)guardReservationShortfall * PriorityWeight;
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
                    events.Add(new ProfessionChangedMessage(entity, prevIntent.Kind, bestKind, bestHex, bestEntity));
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

            offers.Dispose();
            offersPerKind.Dispose();
            activePerKind.Dispose();
            reservedPerKind.Dispose();
            justAssignedPerKind.Dispose();
            friendlyEmitters.Dispose();
            needyCaves.Dispose();
        }

        struct NeedyCave
        {
            public Entity Entity;
            public int2   Hex;
        }

        static bool PackHasFood(DynamicBuffer<PackSlot> buf)
        {
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].Count == 0) continue;
                if (ItemDB.EnergyValue(buf[i].ItemId) > 0f) return true;
            }
            return false;
        }

        static int CountFood(DynamicBuffer<BankLedgerBase> buf)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                if (ItemDB.EnergyValue(buf[i].ItemId) <= 0f) continue;
                total += buf[i].Count;
            }
            return total;
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
                    if (variant == OfferVariant.LooterArrow)  return SearchRadius * 2;
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

        bool TryFindHostile(NativeParallelMultiHashMap<int, HashedTarget> hash,
                            float3 originWorld,
                            NativeArray<TerritoryEmitter> friendlyEmitters,
                            out int2 outHex, out Entity outEntity, out int outDist)
        {
            const int ScanRadius = 6;
            // Track nearest overall AND nearest inside friendly territory.
            // If any intruder is in-territory the Archer targets them first,
            // so the defender snaps to threats-at-home instead of whatever
            // happens to be closest in world coords.
            float3 bestPos = default, inBestPos = default;
            Entity bestEntity = Entity.Null, inBestEntity = Entity.Null;
            float  bestSq = float.MaxValue, inBestSq = float.MaxValue;

            int cx = (int)math.floor(originWorld.x / SpatialHashSystem.CellSize);
            int cy = (int)math.floor(originWorld.y / SpatialHashSystem.CellSize);

            for (int dx = -ScanRadius; dx <= ScanRadius; dx++)
            {
                for (int dy = -ScanRadius; dy <= ScanRadius; dy++)
                {
                    int key = SpatialHashSystem.CellKey(cx + dx, cy + dy);
                    if (!hash.TryGetFirstValue(key, out var target, out var it)) continue;

                    do
                    {
                        if (target.Faction != FactionType.Hostile && target.Faction != FactionType.Beast) continue;
                        float d2 = math.distancesq(
                            new float2(originWorld.x, originWorld.y),
                            target.Position);
                        if (d2 < bestSq)
                        {
                            bestSq = d2;
                            bestPos = new float3(target.Position.x, target.Position.y, 0f);
                            bestEntity = target.Entity;
                        }

                        if (friendlyEmitters.Length > 0 && d2 < inBestSq)
                        {
                            int2 hex = HexMeshUtil.WorldToHex(target.Position.x, target.Position.y, 0.25f);
                            if (InsideAnyEmitter(hex, friendlyEmitters))
                            {
                                inBestSq = d2;
                                inBestPos = new float3(target.Position.x, target.Position.y, 0f);
                                inBestEntity = target.Entity;
                            }
                        }
                    } while (hash.TryGetNextValue(out target, ref it));
                }
            }

            // Prefer the intruder inside our border if we found one.
            if (inBestEntity != Entity.Null)
            {
                outHex = HexMeshUtil.WorldToHex(inBestPos.x, inBestPos.y, 0.25f);
                outEntity = inBestEntity;
                outDist = (int)math.round(math.sqrt(inBestSq));
                return true;
            }

            if (bestEntity == Entity.Null)
            {
                outHex = default;
                outEntity = Entity.Null;
                outDist = int.MaxValue;
                return false;
            }

            outHex = HexMeshUtil.WorldToHex(bestPos.x, bestPos.y, 0.25f);
            outEntity = bestEntity;
            outDist = (int)math.round(math.sqrt(bestSq));
            return true;
        }

        static bool InsideAnyEmitter(int2 hex, NativeArray<TerritoryEmitter> emitters)
        {
            for (int i = 0; i < emitters.Length; i++)
            {
                var e = emitters[i];
                if (AxialDistance(hex.x - e.Center.x, hex.y - e.Center.y) <= e.Radius) return true;
            }
            return false;
        }

        static int AxialDistance(int dq, int dr)
        {
            int ds = -dq - dr;
            return (math.abs(dq) + math.abs(dr) + math.abs(ds)) / 2;
        }

        static int HexDistance(int2 a, int2 b) => AxialDistance(b.x - a.x, b.y - a.y);

        void LogDispatchDiagnostic()
        {
            int totalUnits = 0, reliefBlocked = 0, controlled = 0, kindNone = 0;
            var jobKindCounts  = new int[14];
            var lastKindCounts = new int[24];
            var goalKindCounts = new int[8];
            var goalPrioBuckets = new int[6];
            int movementIdle = 0, movementStepping = 0, movementDwelling = 0;
            int queueEmpty = 0, queueActive = 0, queuePending = 0, queueInvalid = 0, queueCompleted = 0;
            int atTargetHarvestReady = 0, atTargetBlocked = 0, committedButIdle = 0;

            foreach (var (jobIntent, reliefIntent, state, goal, movement, tasksRef, entity) in
                     SystemAPI.Query<
                         RefRO<ProfessionIntent>,
                         RefRO<ReliefIntent>,
                         RefRO<ActivityState>,
                         RefRO<MovementGoal>,
                         RefRO<UnitMovement>,
                         DynamicBuffer<TaskMemory>>().WithEntityAccess())
            {
                totalUnits++;
                if (reliefIntent.ValueRO.Kind != ReliefKind.None) reliefBlocked++;
                if (EntityManager.HasComponent<ControlledUnitTag>(entity)) controlled++;

                byte k = jobIntent.ValueRO.Kind;
                if (k == ProfessionKind.None) kindNone++;
                else if (k < jobKindCounts.Length) jobKindCounts[k]++;

                byte lk = state.ValueRO.LastKind;
                if (lk < lastKindCounts.Length) lastKindCounts[lk]++;

                byte gk = goal.ValueRO.Kind;
                if (gk < goalKindCounts.Length) goalKindCounts[gk]++;

                byte gp = goal.ValueRO.Priority;
                if (gp == 0) goalPrioBuckets[0]++;
                else if (gp <= 10) goalPrioBuckets[1]++;
                else if (gp <= 30) goalPrioBuckets[2]++;
                else if (gp <= 40) goalPrioBuckets[3]++;
                else if (gp <= 50) goalPrioBuckets[4]++;
                else               goalPrioBuckets[5]++;

                var m = movement.ValueRO;
                bool isIdle = !(m.DwellTimer > 0f) && m.TargetHex.Equals(m.CurrentHex);
                if (m.DwellTimer > 0f) movementDwelling++;
                else if (isIdle) movementIdle++;
                else movementStepping++;

                var tasks = tasksRef;
                if (tasks.Length == 0) queueEmpty++;
                else
                {
                    byte st = tasks[0].State;
                    if (st == TaskState.Active)      queueActive++;
                    else if (st == TaskState.Pending) queuePending++;
                    else if (st == TaskState.Invalidated) queueInvalid++;
                    else if (st == TaskState.Completed)   queueCompleted++;
                }

                bool committed = tasks.Length > 0 && tasks[0].State == TaskState.Active;
                bool atTarget  = k != ProfessionKind.None && math.all(jobIntent.ValueRO.TargetHex == m.CurrentHex);
                if (atTarget)
                {
                    if (m.HarvestCooldown <= 0f) atTargetHarvestReady++;
                    else atTargetBlocked++;
                }
                if (committed && isIdle && !atTarget) committedButIdle++;
            }

            Debug.Log(
                $"[ProfessionDispatch diag] units={totalUnits} relief={reliefBlocked} controlled={controlled}\n" +
                $"  jobIntent:  None={kindNone} Lumberjack={jobKindCounts[ProfessionKind.Lumberjack]} Miner={jobKindCounts[ProfessionKind.Miner]} " +
                $"Guard={jobKindCounts[ProfessionKind.Guard]} Looter={jobKindCounts[ProfessionKind.Looter]} Farmer={jobKindCounts[ProfessionKind.Farmer]} " +
                $"Builder={jobKindCounts[ProfessionKind.Builder]} Chef={jobKindCounts[ProfessionKind.Chef]} Hunter={jobKindCounts[ProfessionKind.Hunter]} " +
                $"Blacksmith={jobKindCounts[ProfessionKind.Blacksmith]} Craftsman={jobKindCounts[ProfessionKind.Craftsman]}\n" +
                $"  activity:   None={lastKindCounts[0]} Idle={lastKindCounts[1]} Wandering={lastKindCounts[2]} MovingToOrder={lastKindCounts[3]} " +
                $"Sleeping={lastKindCounts[4]} Eating={lastKindCounts[5]} Healing={lastKindCounts[6]} ReturningToBase={lastKindCounts[7]} " +
                $"SeekingAid={lastKindCounts[8]} Foraging={lastKindCounts[9]} Lumberjacking={lastKindCounts[10]} Mining={lastKindCounts[11]} " +
                $"Hunting={lastKindCounts[12]} Looting={lastKindCounts[13]} Farming={lastKindCounts[14]} Building={lastKindCounts[15]} " +
                $"Cooking={lastKindCounts[16]} Guarding={lastKindCounts[17]} Traveling={lastKindCounts[18]} " +
                $"Crafting={lastKindCounts[19]} Smithing={lastKindCounts[20]}\n" +
                $"  goalKind:   None={goalKindCounts[GoalKind.None]} MoveToHex={goalKindCounts[GoalKind.MoveToHex]} " +
                $"ReturnToBase={goalKindCounts[GoalKind.ReturnToBase]} Wander={goalKindCounts[GoalKind.Wander]} " +
                $"Hunt={goalKindCounts[GoalKind.Hunt]} Flee={goalKindCounts[GoalKind.Flee]} Follow={goalKindCounts[GoalKind.Follow]}\n" +
                $"  goalPrio:   None={goalPrioBuckets[0]} Wander<=10={goalPrioBuckets[1]} Harvest<=30={goalPrioBuckets[2]} " +
                $"Hunt<=40={goalPrioBuckets[3]} Return<=50={goalPrioBuckets[4]} Order+={goalPrioBuckets[5]}\n" +
                $"  movement:   idle={movementIdle} stepping={movementStepping} dwelling={movementDwelling}\n" +
                $"  queue:      empty={queueEmpty} active={queueActive} pending={queuePending} invalidated={queueInvalid} completed={queueCompleted}\n" +
                $"  harvest:    atTarget_ready={atTargetHarvestReady} atTarget_cooling={atTargetBlocked} committed_but_idle={committedButIdle}");
        }
    }
}
