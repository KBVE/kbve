using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Reactive on Tower <see cref="BuildingTier"/> change — attaches the volley defence kit, scales <see cref="TerritoryEmitter"/> radius per tier, and branches on <see cref="BuildingVariant"/> for T1 alt-picks. T0 stays a passive territory pole. T1 variants: 0 = WatchTower (defense), 1 = BeaconTower (hybrid), 2 = HighwatchTower (recon). T2 (SentinelTower) gets heavier volley + radius 7. Off-main-thread parallel <see cref="TowerRebakeJob"/> + ECB.ParallelWriter for every component add/set/remove.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildingUpgradeSystem))]
    public partial struct TowerTierServicesSystem : ISystem
    {
        EntityQuery _towersWithTier;

        public void OnCreate(ref SystemState state)
        {
            _towersWithTier = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<TowerTag, BuildingTier, TerritoryEmitter, BuildingHealth>()
                .Build(ref state);
            _towersWithTier.SetChangedVersionFilter(ComponentType.ReadOnly<BuildingTier>());
            state.RequireForUpdate(_towersWithTier);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            state.Dependency = new TowerRebakeJob
            {
                VariantLookup   = SystemAPI.GetComponentLookup<BuildingVariant>(true),
                TerritoryLookup = SystemAPI.GetComponentLookup<TerritoryEmitter>(true),
                HpLookup        = SystemAPI.GetComponentLookup<BuildingHealth>(true),
                VolleyLookup    = SystemAPI.GetComponentLookup<OutpostVolley>(true),
                PoolLookup      = SystemAPI.GetComponentLookup<OutpostArrowPool>(true),
                VisionLookup    = SystemAPI.GetComponentLookup<VisionRadius>(true),
                Ecb             = ecb,
            }.ScheduleParallel(_towersWithTier, state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct TowerRebakeJob : IJobEntity
    {
        [ReadOnly] public ComponentLookup<BuildingVariant>   VariantLookup;
        [ReadOnly] public ComponentLookup<TerritoryEmitter>  TerritoryLookup;
        [ReadOnly] public ComponentLookup<BuildingHealth>    HpLookup;
        [ReadOnly] public ComponentLookup<OutpostVolley>     VolleyLookup;
        [ReadOnly] public ComponentLookup<OutpostArrowPool>  PoolLookup;
        [ReadOnly] public ComponentLookup<VisionRadius>      VisionLookup;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity tower, [ChunkIndexInQuery] int chunkIdx, in BuildingTier tier)
        {
            byte t = tier.Value;
            byte v = VariantLookup.HasComponent(tower) ? VariantLookup[tower].Value : (byte)0;

            byte radius;
            bool wantsVolley;
            float volleyCooldown = 4f, volleyRange = 8f;
            byte volleyArrows = 6, volleyArrowCost = 1;
            float volleyDamage = 5f;
            ushort poolStock = 60;
            float visionRadius = 0f;

            switch (t)
            {
                case 0:
                    // T0 Tower now fires — heavier per-arrow damage than
                    // the basic Outpost so towers feel meaningful as
                    // standalone defenses while costing the upkeep cost.
                    radius = 3; wantsVolley = true;
                    volleyCooldown = 5f; volleyRange = 11f;
                    volleyArrows = 6; volleyArrowCost = 2; volleyDamage = 12f;
                    poolStock = 80;
                    break;
                case 2:
                    radius = 7; wantsVolley = true;
                    volleyCooldown = 3f; volleyRange = 12f;
                    volleyArrows = 12; volleyArrowCost = 2; volleyDamage = 7f;
                    poolStock = 120;
                    break;
                default:
                    if (v == 1)
                    {
                        radius = 7; wantsVolley = true;
                        volleyCooldown = 5f; volleyRange = 10f;
                        volleyArrows = 4; volleyArrowCost = 1; volleyDamage = 4f;
                        poolStock = 40;
                        visionRadius = 10f;
                    }
                    else if (v == 2)
                    {
                        radius = 4; wantsVolley = false;
                        visionRadius = 14f;
                    }
                    else
                    {
                        radius = 5; wantsVolley = true;
                    }
                    break;
            }

            var territory = TerritoryLookup[tower];
            territory.Radius = radius;
            Ecb.SetComponent(chunkIdx, tower, territory);

            ushort newMaxHp = ResolveMaxHp(t, v);
            var hp = HpLookup[tower];
            float ratio = hp.Max > 0 ? (float)hp.Value / hp.Max : 1f;
            hp.Max   = newMaxHp;
            hp.Value = (ushort)math.clamp((int)math.round(ratio * newMaxHp), 0, newMaxHp);
            Ecb.SetComponent(chunkIdx, tower, hp);

            if (wantsVolley)
            {
                var volley = new OutpostVolley
                {
                    CooldownSeconds    = volleyCooldown,
                    TimeSinceVolley    = volleyCooldown,
                    Range              = volleyRange,
                    ArrowsPerVolley    = volleyArrows,
                    ArrowCost          = volleyArrowCost,
                    SpreadHalfAngleRad = 0.45f,
                    ProjectileSpeed    = 14f,
                    ProjectileLifetime = 3f,
                    DamagePerArrow     = volleyDamage,
                };
                if (VolleyLookup.HasComponent(tower)) Ecb.SetComponent(chunkIdx, tower, volley);
                else                                  Ecb.AddComponent(chunkIdx, tower, volley);

                if (PoolLookup.HasComponent(tower))
                {
                    var pool = PoolLookup[tower];
                    if (pool.Stock < poolStock) pool.Stock = poolStock;
                    Ecb.SetComponent(chunkIdx, tower, pool);
                }
                else
                {
                    Ecb.AddComponent(chunkIdx, tower, new OutpostArrowPool { Stock = poolStock });
                }
            }
            else
            {
                if (VolleyLookup.HasComponent(tower)) Ecb.RemoveComponent<OutpostVolley>(chunkIdx, tower);
                if (PoolLookup.HasComponent(tower))   Ecb.RemoveComponent<OutpostArrowPool>(chunkIdx, tower);
            }

            if (visionRadius > 0f)
            {
                if (VisionLookup.HasComponent(tower))
                    Ecb.SetComponent(chunkIdx, tower, new VisionRadius { Value = visionRadius });
                else
                    Ecb.AddComponent(chunkIdx, tower, new VisionRadius { Value = visionRadius });
            }
            else if (VisionLookup.HasComponent(tower))
            {
                Ecb.RemoveComponent<VisionRadius>(chunkIdx, tower);
            }
        }

        static ushort ResolveMaxHp(byte tier, byte variant)
        {
            if (tier >= 2) return 720;
            if (tier == 1)
            {
                if (variant == 1) return 400;
                if (variant == 2) return 360;
                return 480;
            }
            return 320;
        }
    }
}
