using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Cooldown-gated melee strike. SpatialHash feeds unit candidates; a per-frame NativeArray of building targets is staged on main thread so the Burst job can run over it without ComponentLookup per entity. Async ECB via EndSimulationEntityCommandBufferSystem.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CombatSystemGroup))]
    [UpdateAfter(typeof(RangedAttackSystem))]
    public partial struct MeleeAttackSystem : ISystem
    {
        EntityQuery _buildingQuery;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<MeleeAttack>();
            // EntityQueryBuilder uses a stack-scratch Allocator.Temp buffer so the
            // whole construction stays Burst-safe. The GetEntityQuery(params ComponentType[])
            // overload allocates a managed array and trips Burst BC1028.
            _buildingQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Building>()
                .WithAll<BuildingHealth>()
                .WithAll<LocalTransform>()
                .Build(ref state);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<SpatialHashSingleton>(out var spatial)) return;
            if (!spatial.Hash.IsCreated) return;

            // Stage building targets through a Burst IJob so the
            // ComponentLookup<LocalTransform> reads chain via lookup safety
            // against in-flight writers (UnitMovementJob etc.). Main-thread
            // indexer access in Burst-direct OnUpdate doesn't auto-sync;
            // moving the loop into a job both fixes the latent race and
            // leaves the chain async (no Complete barrier needed).
            var buildingEntities = _buildingQuery.ToEntityArray(Allocator.TempJob);
            var buildingTargets  = new NativeArray<MeleeBuildingTarget>(
                buildingEntities.Length, Allocator.TempJob);

            state.Dependency = new BuildMeleeTargetsJob
            {
                Entities        = buildingEntities,
                BuildingLookup  = SystemAPI.GetComponentLookup<Building>(true),
                TransformLookup = SystemAPI.GetComponentLookup<LocalTransform>(true),
                Output          = buildingTargets,
            }.Schedule(state.Dependency);

            state.Dependency = buildingEntities.Dispose(state.Dependency);

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new MeleeAttackJob
            {
                Dt              = SystemAPI.Time.DeltaTime,
                Hash            = spatial.Hash,
                BuildingTargets = buildingTargets,
                MoraleLookup    = SystemAPI.GetComponentLookup<MoraleBuff>(true),
                Ecb             = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = buildingTargets.Dispose(state.Dependency);
        }
    }

    /// <summary>Burst-compiled main-thread-replacement for <see cref="MeleeAttackSystem"/>'s building-target staging. Chains via <see cref="ComponentLookup{T}"/> safety so it sees fully-written <see cref="LocalTransform"/> data without a sync barrier; the parallel <see cref="MeleeAttackJob"/> downstream picks up the resulting array directly.</summary>
    [BurstCompile]
    public struct BuildMeleeTargetsJob : IJob
    {
        [ReadOnly] public NativeArray<Entity>             Entities;
        [ReadOnly] public ComponentLookup<Building>       BuildingLookup;
        [ReadOnly] public ComponentLookup<LocalTransform> TransformLookup;
        public NativeArray<MeleeBuildingTarget>           Output;

        public void Execute()
        {
            for (int i = 0; i < Entities.Length; i++)
            {
                var e = Entities[i];
                var b = BuildingLookup[e];
                var t = TransformLookup[e];
                Output[i] = new MeleeBuildingTarget
                {
                    Entity       = e,
                    OwnerFaction = b.OwnerFaction,
                    Position     = new float2(t.Position.x, t.Position.y),
                };
            }
        }
    }

    public struct MeleeBuildingTarget
    {
        public Entity Entity;
        public byte   OwnerFaction;
        public float2 Position;
    }

    [BurstCompile]
    public partial struct MeleeAttackJob : IJobEntity
    {
        public float Dt;

        [ReadOnly] public NativeParallelMultiHashMap<int, HashedTarget> Hash;
        [ReadOnly] public NativeArray<MeleeBuildingTarget>              BuildingTargets;
        [ReadOnly] public ComponentLookup<MoraleBuff>                   MoraleLookup;

        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in LocalTransform transform,
                     in Faction faction,
                     ref MeleeAttack attack)
        {
            attack.TimeSinceShot += Dt;
            if (attack.TimeSinceShot < attack.Cooldown) return;

            float2 pos = new float2(transform.Position.x, transform.Position.y);
            byte strikerFaction = faction.Value;
            float rangeSq = attack.Range * attack.Range;
            byte mode = attack.TargetMode;

            Entity bestUnit     = Entity.Null;
            float  bestUnitSq   = rangeSq;
            Entity bestBuilding = Entity.Null;
            float  bestBldgSq   = rangeSq;

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
                        if (!Hash.TryGetFirstValue(key, out var target, out var it)) continue;
                        do
                        {
                            if (target.Entity == entity) continue;
                            if (target.Faction == strikerFaction) continue;
                            if (target.Faction == FactionType.Neutral) continue;
                            float d2 = math.distancesq(pos, target.Position);
                            if (d2 < bestUnitSq)
                            {
                                bestUnitSq = d2;
                                bestUnit = target.Entity;
                            }
                        } while (Hash.TryGetNextValue(out target, ref it));
                    }
                }
            }

            if (mode != MeleeTargetMode.UnitsOnly)
            {
                for (int i = 0; i < BuildingTargets.Length; i++)
                {
                    var bt = BuildingTargets[i];
                    if (bt.OwnerFaction == strikerFaction) continue;
                    if (bt.OwnerFaction == FactionType.Neutral) continue;
                    float d2 = math.distancesq(pos, bt.Position);
                    if (d2 < bestBldgSq)
                    {
                        bestBldgSq = d2;
                        bestBuilding = bt.Entity;
                    }
                }
            }

            Entity bestTarget = PickByMode(mode, bestUnit, bestUnitSq, bestBuilding, bestBldgSq);
            if (bestTarget == Entity.Null) return;

            float damage = attack.Damage;
            if (MoraleLookup.HasComponent(entity))
            {
                sbyte bonus = MoraleLookup[entity].CombatBonusPct;
                if (bonus != 0) damage *= 1f + bonus / 100f;
            }

            var evt = Ecb.CreateEntity(chunkIdx);
            Ecb.AddComponent(chunkIdx, evt, new DamageEvent
            {
                Target        = bestTarget,
                Amount        = damage,
                Mod           = ArrowMod.None,
                SourceFaction = strikerFaction,
            });

            attack.TimeSinceShot = 0f;
        }

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
                default:
                    if (unit == Entity.Null) return bldg;
                    if (bldg == Entity.Null) return unit;
                    return unitSq <= bldgSq ? unit : bldg;
            }
        }
    }
}
