using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Picks the highest-priority job with nearby work for each Player unit; writes JobIntent. Skips units currently under a Relief intent.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ReliefSystem))]
    public partial class JobSystem : SystemBase
    {
        const int SearchRadius = 5;

        bool _diagLogged;

        protected override void OnUpdate()
        {
            RunDispatch();

            if (!_diagLogged && SystemAPI.Time.ElapsedTime > 3.0)
            {
                _diagLogged = true;
                LogDispatchDiagnostic();
            }
        }

        void RunDispatch()
        {
            SystemAPI.TryGetSingleton<SpatialHashSingleton>(out var spatial);
            var hexResourceLookup = SystemAPI.GetComponentLookup<HexResources>(isReadOnly: true);

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

            foreach (var (priorities, reliefIntent, jobIntentRef, movement, transform, entity) in
                     SystemAPI.Query<
                         RefRO<JobPriorities>,
                         RefRO<ReliefIntent>,
                         RefRW<JobIntent>,
                         RefRO<UnitMovement>,
                         RefRO<LocalTransform>>().WithEntityAccess())
            {
                if (reliefIntent.ValueRO.Kind != ReliefKind.None)
                {
                    if (jobIntentRef.ValueRO.Kind != JobKind.None)
                        jobIntentRef.ValueRW = default;
                    continue;
                }

                // Manually-driven units (King by default, or any
                // possessed goblin) skip job assignment — the player is
                // steering them, the AI shouldn't assign work in
                // parallel. Releasing control returns the unit to the
                // job dispatcher next tick.
                if (EntityManager.HasComponent<ControlledUnitTag>(entity))
                {
                    jobIntentRef.ValueRW = default;
                    continue;
                }

                var p = priorities.ValueRO;
                var currentHex = movement.ValueRO.CurrentHex;

                byte  bestKind   = JobKind.None;
                byte  bestPrio   = 0;
                int   bestDist   = int.MaxValue;
                int2  bestHex    = currentHex;
                Entity bestEntity = Entity.Null;

                TryRole(p.Forager,    JobKind.Forager,    HarvestRole.Forager,    currentHex,
                        hexResourceLookup, ref bestKind, ref bestPrio, ref bestDist, ref bestHex);
                TryRole(p.Lumberjack, JobKind.Lumberjack, HarvestRole.Lumberjack, currentHex,
                        hexResourceLookup, ref bestKind, ref bestPrio, ref bestDist, ref bestHex);
                TryRole(p.Miner,      JobKind.Miner,      HarvestRole.Miner,      currentHex,
                        hexResourceLookup, ref bestKind, ref bestPrio, ref bestDist, ref bestHex);

                if (p.Archer > bestPrio && spatial.Hash.IsCreated)
                {
                    if (TryFindHostile(spatial.Hash, transform.ValueRO.Position,
                                       friendlyEmitters.AsArray(),
                                       out var hostileHex, out var hostileEntity, out int hostileDist))
                    {
                        if (p.Archer > bestPrio || (p.Archer == bestPrio && hostileDist < bestDist))
                        {
                            bestKind   = JobKind.Archer;
                            bestPrio   = p.Archer;
                            bestDist   = hostileDist;
                            bestHex    = hostileHex;
                            bestEntity = hostileEntity;
                        }
                    }
                }

                if (p.Farmer > bestPrio && hasFarm)
                {
                    int farmDist = HexDistance(currentHex, farmHex);
                    if (farmDist <= SearchRadius * 2)
                    {
                        bestKind   = JobKind.Farmer;
                        bestPrio   = p.Farmer;
                        bestDist   = farmDist;
                        bestHex    = farmHex;
                        bestEntity = nearestFarm;
                    }
                }

                if (p.Builder > bestPrio && hasCapital)
                {
                    // Construction sites and damaged Player-faction
                    // buildings compete for the same Builder priority
                    // slot — whichever target is closest wins. Repair is
                    // construction's twin: same skill, same materials path.
                    int    builderBestDist = int.MaxValue;
                    Entity builderBest     = Entity.Null;
                    int2   builderBestHex  = default;

                    for (int si = 0; si < sites.Length; si++)
                    {
                        var site = EntityManager.GetComponentData<ConstructionSite>(sites[si]);
                        int d = HexDistance(currentHex, site.RootHex);
                        if (d < builderBestDist)
                        {
                            builderBestDist = d;
                            builderBest     = sites[si];
                            builderBestHex  = site.RootHex;
                        }
                    }

                    for (int di = 0; di < damagedCandidates.Length; di++)
                    {
                        var b = EntityManager.GetComponentData<Building>(damagedCandidates[di]);
                        if (b.OwnerFaction != FactionType.Player) continue;
                        var hp = EntityManager.GetComponentData<BuildingHealth>(damagedCandidates[di]);
                        if (hp.Value >= hp.Max) continue;

                        int d = HexDistance(currentHex, b.RootHex);
                        if (d > SearchRadius * 2) continue;
                        if (d < builderBestDist)
                        {
                            builderBestDist = d;
                            builderBest     = damagedCandidates[di];
                            builderBestHex  = b.RootHex;
                        }
                    }

                    if (builderBest != Entity.Null)
                    {
                        bestKind   = JobKind.Builder;
                        bestPrio   = p.Builder;
                        bestDist   = builderBestDist;
                        bestHex    = builderBestHex;
                        bestEntity = builderBest;
                    }
                }

                if (p.Chef > bestPrio && hasCapital)
                {
                    int capDist = HexDistance(currentHex, capitalHex);
                    bestKind   = JobKind.Chef;
                    bestPrio   = p.Chef;
                    bestDist   = capDist;
                    bestHex    = capitalHex;
                    bestEntity = capital;
                }

                if (p.Looter > bestPrio && groundArrows.Length > 0)
                {
                    int   looterBestDist = int.MaxValue;
                    Entity looterBest    = Entity.Null;
                    int2   looterBestHex = default;
                    for (int ai = 0; ai < groundArrows.Length; ai++)
                    {
                        var t = EntityManager.GetComponentData<LocalTransform>(groundArrows[ai]);
                        var hex = HexMeshUtil.WorldToHex(t.Position.x, t.Position.y, 0.25f);
                        int d = HexDistance(currentHex, hex);
                        if (d > SearchRadius * 2) continue;
                        if (d < looterBestDist)
                        {
                            looterBestDist = d;
                            looterBest     = groundArrows[ai];
                            looterBestHex  = hex;
                        }
                    }
                    if (looterBest != Entity.Null)
                    {
                        bestKind   = JobKind.Looter;
                        bestPrio   = p.Looter;
                        bestDist   = looterBestDist;
                        bestHex    = looterBestHex;
                        bestEntity = looterBest;
                    }
                }

                jobIntentRef.ValueRW = new JobIntent
                {
                    Kind         = bestKind,
                    TargetHex    = bestHex,
                    TargetEntity = bestEntity,
                };
            }

            friendlyEmitters.Dispose();
        }

        void TryRole(byte priority, byte kind, HarvestRole role, int2 origin,
                     ComponentLookup<HexResources> hexResourceLookup,
                     ref byte bestKind, ref byte bestPrio, ref int bestDist, ref int2 bestHex)
        {
            if (priority == 0) return;
            if (priority < bestPrio) return;

            if (!TryFindResourceHex(role, origin, hexResourceLookup, out int2 hex, out int dist)) return;

            if (priority > bestPrio || (priority == bestPrio && dist < bestDist))
            {
                bestKind = kind;
                bestPrio = priority;
                bestDist = dist;
                bestHex  = hex;
            }
        }

        bool TryFindResourceHex(HarvestRole role, int2 origin,
                                ComponentLookup<HexResources> hexResourceLookup,
                                out int2 outHex, out int outDist)
        {
            int  bestDist = int.MaxValue;
            int2 bestHex  = origin;
            bool found    = false;

            for (int dq = -SearchRadius; dq <= SearchRadius; dq++)
            {
                for (int dr = -SearchRadius; dr <= SearchRadius; dr++)
                {
                    int dist = AxialDistance(dq, dr);
                    if (dist > SearchRadius) continue;
                    if (dist >= bestDist) continue;

                    var hex = new int2(origin.x + dq, origin.y + dr);
                    if (!HexHoverSystem.TryGetHexEntity(hex, out var tile)) continue;
                    if (!hexResourceLookup.HasComponent(tile)) continue;

                    var res = hexResourceLookup[tile];
                    if (!RoleMatches(role, in res)) continue;

                    bestDist = dist;
                    bestHex  = hex;
                    found    = true;
                }
            }

            outHex  = bestHex;
            outDist = bestDist;
            return found;
        }

        static bool RoleMatches(HarvestRole role, in HexResources res)
        {
            return role switch
            {
                HarvestRole.Forager    => (res.Berries | res.Mushrooms | res.Herbs | res.Cactus) != 0,
                HarvestRole.Lumberjack => (res.Wood | res.Leaves | res.Branches) != 0,
                HarvestRole.Miner      => res.Stone != 0,
                _                      => false,
            };
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
            var hexResourceLookup = SystemAPI.GetComponentLookup<HexResources>(isReadOnly: true);
            int totalUnits = 0, idleUnits = 0, reliefBlocked = 0, controlled = 0;
            int noHexEntity = 0, hasForageTarget = 0, hasLumberTarget = 0, hasMinerTarget = 0;

            foreach (var (priorities, reliefIntent, jobIntent, movement, entity) in
                     SystemAPI.Query<RefRO<JobPriorities>, RefRO<ReliefIntent>, RefRO<JobIntent>, RefRO<UnitMovement>>().WithEntityAccess())
            {
                totalUnits++;
                if (reliefIntent.ValueRO.Kind != ReliefKind.None) { reliefBlocked++; continue; }
                if (EntityManager.HasComponent<ControlledUnitTag>(entity)) { controlled++; continue; }
                if (jobIntent.ValueRO.Kind != JobKind.None) continue;

                idleUnits++;
                var here = movement.ValueRO.CurrentHex;
                if (!HexHoverSystem.TryGetHexEntity(here, out _)) noHexEntity++;

                if (priorities.ValueRO.Forager > 0
                    && TryFindResourceHex(HarvestRole.Forager, here, hexResourceLookup, out _, out _)) hasForageTarget++;
                if (priorities.ValueRO.Lumberjack > 0
                    && TryFindResourceHex(HarvestRole.Lumberjack, here, hexResourceLookup, out _, out _)) hasLumberTarget++;
                if (priorities.ValueRO.Miner > 0
                    && TryFindResourceHex(HarvestRole.Miner, here, hexResourceLookup, out _, out _)) hasMinerTarget++;
            }

            Debug.Log($"[JobSystem diag] units={totalUnits} idle={idleUnits} reliefBlocked={reliefBlocked} controlled={controlled} " +
                      $"| of idle: currentHexUnloaded={noHexEntity} forageTargetFound={hasForageTarget} lumberTargetFound={hasLumberTarget} minerTargetFound={hasMinerTarget}");
        }
    }
}
