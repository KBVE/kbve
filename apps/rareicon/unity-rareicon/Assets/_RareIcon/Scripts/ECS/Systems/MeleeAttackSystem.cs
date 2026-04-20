using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Cooldown-gated melee strike. Each tick the striker scans the spatial hash for enemy units inside Range and separately iterates Buildings with BuildingHealth whose owner is a different faction; nearest target wins and eats a DamageEvent.</summary>
    [UpdateInGroup(typeof(CombatSystemGroup))]
    [UpdateAfter(typeof(RangedAttackSystem))]
    public partial class MeleeAttackSystem : SystemBase
    {
        protected override void OnCreate() => RequireForUpdate<MeleeAttack>();

        protected override void OnUpdate()
        {
            var hashSys = World.GetExistingSystemManaged<SpatialHashSystem>();
            if (hashSys == null || !hashSys.Hash.IsCreated) return;
            var hash = hashSys.Hash;

            float dt = SystemAPI.Time.DeltaTime;
            var ecb  = new EntityCommandBuffer(Allocator.Temp);

            // Pre-collect buildings once — few in number so we skip the hash
            // and just iterate this small list per striker.
            using var buildingQuery = EntityManager.CreateEntityQuery(
                ComponentType.ReadOnly<Building>(),
                ComponentType.ReadOnly<BuildingHealth>(),
                ComponentType.ReadOnly<LocalTransform>());
            using var buildings = buildingQuery.ToEntityArray(Allocator.Temp);

            foreach (var (transform, faction, attackRef, entity) in
                     SystemAPI.Query<RefRO<LocalTransform>, RefRO<Faction>, RefRW<MeleeAttack>>()
                              .WithEntityAccess())
            {
                var attack = attackRef.ValueRO;
                attack.TimeSinceShot += dt;
                if (attack.TimeSinceShot < attack.Cooldown)
                {
                    attackRef.ValueRW = attack;
                    continue;
                }

                float2 pos = new float2(transform.ValueRO.Position.x, transform.ValueRO.Position.y);
                byte strikerFaction = faction.ValueRO.Value;
                float rangeSq = attack.Range * attack.Range;
                byte mode = attack.TargetMode;

                Entity bestUnit     = Entity.Null;
                float  bestUnitSq   = rangeSq;
                Entity bestBuilding = Entity.Null;
                float  bestBldgSq   = rangeSq;

                // Unit targets via spatial hash (skipped in BuildingsOnly mode).
                if (mode != MeleeTargetMode.BuildingsOnly)
                {
                    int reach = (int)math.ceil(attack.Range / SpatialHashSystem.CellSize);
                    int cx = (int)math.floor(pos.x / SpatialHashSystem.CellSize);
                    int cy = (int)math.floor(pos.y / SpatialHashSystem.CellSize);
                    for (int dx = -reach; dx <= reach; dx++)
                    {
                        for (int dy = -reach; dy <= reach; dy++)
                        {
                            int key = SpatialHashSystem.CellKey(cx + dx, cy + dy);
                            if (!hash.TryGetFirstValue(key, out var target, out var it)) continue;
                            do
                            {
                                if (target.Entity == entity) continue;
                                if (target.Faction == strikerFaction) continue;
                                float d2 = math.distancesq(pos, target.Position);
                                if (d2 < bestUnitSq)
                                {
                                    bestUnitSq = d2;
                                    bestUnit = target.Entity;
                                }
                            } while (hash.TryGetNextValue(out target, ref it));
                        }
                    }
                }

                // Building targets (skipped in UnitsOnly mode).
                if (mode != MeleeTargetMode.UnitsOnly)
                {
                    for (int i = 0; i < buildings.Length; i++)
                    {
                        var b = EntityManager.GetComponentData<Building>(buildings[i]);
                        if (b.OwnerFaction == strikerFaction) continue;

                        var bt = EntityManager.GetComponentData<LocalTransform>(buildings[i]);
                        float2 bp = new float2(bt.Position.x, bt.Position.y);
                        float d2 = math.distancesq(pos, bp);
                        if (d2 < bestBldgSq)
                        {
                            bestBldgSq = d2;
                            bestBuilding = buildings[i];
                        }
                    }
                }

                Entity bestTarget = PickByMode(mode, bestUnit, bestUnitSq, bestBuilding, bestBldgSq);

                if (bestTarget == Entity.Null)
                {
                    attackRef.ValueRW = attack;
                    continue;
                }

                var evt = ecb.CreateEntity();
                ecb.AddComponent(evt, new DamageEvent
                {
                    Target        = bestTarget,
                    Amount        = attack.Damage,
                    Mod           = ArrowMod.None,
                    SourceFaction = strikerFaction,
                });

                attack.TimeSinceShot = 0f;
                attackRef.ValueRW = attack;
            }

            ecb.Playback(EntityManager);
            ecb.Dispose();
        }

        // Closest   → whichever class is literally nearest.
        // PreferX   → pick the preferred class if any is in range, even if the other is closer.
        // XOnly     → we already filtered the other side; just return what we have.
        static Entity PickByMode(byte mode,
                                 Entity unit, float unitSq,
                                 Entity bldg, float bldgSq)
        {
            switch (mode)
            {
                case MeleeTargetMode.UnitsOnly:       return unit;
                case MeleeTargetMode.BuildingsOnly:   return bldg;
                case MeleeTargetMode.PreferUnits:
                    return unit != Entity.Null ? unit : bldg;
                case MeleeTargetMode.PreferBuildings:
                    return bldg != Entity.Null ? bldg : unit;
                default: // Closest
                    if (unit == Entity.Null) return bldg;
                    if (bldg == Entity.Null) return unit;
                    return unitSq <= bldgSq ? unit : bldg;
            }
        }
    }
}
