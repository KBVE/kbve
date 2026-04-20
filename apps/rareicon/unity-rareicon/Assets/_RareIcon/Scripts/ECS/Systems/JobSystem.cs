using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Picks the highest-priority job with nearby work for each Player unit; writes JobIntent. Skips units currently under a Relief intent.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ReliefSystem))]
    public partial class JobSystem : SystemBase
    {
        const int SearchRadius = 5;

        protected override void OnUpdate()
        {
            var hashSys = World.GetExistingSystemManaged<SpatialHashSystem>();
            var hexResourceLookup = SystemAPI.GetComponentLookup<HexResources>(isReadOnly: true);

            Entity nearestFarm = Entity.Null;
            int2   farmHex     = default;
            bool   hasFarm     = false;
            foreach (var (b, e) in SystemAPI.Query<RefRO<Building>>().WithEntityAccess())
            {
                if (b.ValueRO.Type == BuildingType.Farm)
                {
                    nearestFarm = e;
                    farmHex     = b.ValueRO.RootHex;
                    hasFarm     = true;
                    break;
                }
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

                if (p.Archer > bestPrio && hashSys != null && hashSys.Hash.IsCreated)
                {
                    if (TryFindHostile(hashSys.Hash, transform.ValueRO.Position,
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

                jobIntentRef.ValueRW = new JobIntent
                {
                    Kind         = bestKind,
                    TargetHex    = bestHex,
                    TargetEntity = bestEntity,
                };
            }
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
                            float3 originWorld, out int2 outHex, out Entity outEntity, out int outDist)
        {
            const int ScanRadius = 6;
            float3 bestPos = default;
            Entity bestEntity = Entity.Null;
            float  bestSq = float.MaxValue;

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
                    } while (hash.TryGetNextValue(out target, ref it));
                }
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

        static int AxialDistance(int dq, int dr)
        {
            int ds = -dq - dr;
            return (math.abs(dq) + math.abs(dr) + math.abs(ds)) / 2;
        }

        static int HexDistance(int2 a, int2 b) => AxialDistance(b.x - a.x, b.y - a.y);
    }
}
