using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Reactive on Outpost <see cref="BuildingTier"/> change — branches volley + territory radius + vision aura per <see cref="BuildingVariant"/>. T0 keeps the existing baseline. T1 default (Watchpost): wider territory + scout reveal aura. T1 alt 1 (BeaconOutpost): big VisionRadius signal-fire reveal, lighter volley. T1 alt 2 (Gatepost): chokepoint defender — heavy volley, tighter territory. T2 (Garrison): full volley + biggest territory ring. Off-main-thread parallel <see cref="OutpostRebakeJob"/> + ECB.ParallelWriter.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildingUpgradeSystem))]
    public partial struct OutpostTierServicesSystem : ISystem
    {
        EntityQuery _outpostsWithTier;

        public void OnCreate(ref SystemState state)
        {
            _outpostsWithTier = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<OutpostTag, BuildingTier, TerritoryEmitter, OutpostVolley, BuildingHealth>()
                .Build(ref state);
            _outpostsWithTier.SetChangedVersionFilter(ComponentType.ReadOnly<BuildingTier>());
            state.RequireForUpdate(_outpostsWithTier);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            state.Dependency = new OutpostRebakeJob
            {
                VariantLookup   = SystemAPI.GetComponentLookup<BuildingVariant>(true),
                TerritoryLookup = SystemAPI.GetComponentLookup<TerritoryEmitter>(true),
                HpLookup        = SystemAPI.GetComponentLookup<BuildingHealth>(true),
                VolleyLookup    = SystemAPI.GetComponentLookup<OutpostVolley>(true),
                PoolLookup      = SystemAPI.GetComponentLookup<OutpostArrowPool>(true),
                VisionLookup    = SystemAPI.GetComponentLookup<VisionRadius>(true),
                Ecb             = ecb,
            }.ScheduleParallel(_outpostsWithTier, state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct OutpostRebakeJob : IJobEntity
    {
        [ReadOnly] public ComponentLookup<BuildingVariant>   VariantLookup;
        [ReadOnly] public ComponentLookup<TerritoryEmitter>  TerritoryLookup;
        [ReadOnly] public ComponentLookup<BuildingHealth>    HpLookup;
        [ReadOnly] public ComponentLookup<OutpostVolley>     VolleyLookup;
        [ReadOnly] public ComponentLookup<OutpostArrowPool>  PoolLookup;
        [ReadOnly] public ComponentLookup<VisionRadius>      VisionLookup;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity outpost, [ChunkIndexInQuery] int chunkIdx, in BuildingTier tier)
        {
            byte t = tier.Value;
            byte v = VariantLookup.HasComponent(outpost) ? VariantLookup[outpost].Value : (byte)0;

            byte radius;
            float volleyCooldown, volleyRange, volleyDamage;
            byte volleyArrows, volleyArrowCost;
            ushort poolStock;
            float visionRadius = 0f;

            switch (t)
            {
                case 0:

                    radius = 5;
                    volleyCooldown = 10f; volleyRange = 15f; volleyDamage = 9f;
                    volleyArrows = 20; volleyArrowCost = 5; poolStock = 160;
                    break;
                case 2:
                    radius = 9;
                    volleyCooldown = 18f; volleyRange = 18f; volleyDamage = 11f;
                    volleyArrows = 28; volleyArrowCost = 6; poolStock = 200;
                    break;
                default:
                    if (v == 1)
                    {
                        radius = 9;
                        volleyCooldown = 30f; volleyRange = 12f; volleyDamage = 6f;
                        volleyArrows = 12; volleyArrowCost = 3; poolStock = 70;
                        visionRadius = 12f;
                    }
                    else if (v == 2)
                    {
                        radius = 5;
                        volleyCooldown = 22f; volleyRange = 14f; volleyDamage = 12f;
                        volleyArrows = 22; volleyArrowCost = 5; poolStock = 140;
                    }
                    else
                    {
                        radius = 7;
                        volleyCooldown = 24f; volleyRange = 16f; volleyDamage = 9f;
                        volleyArrows = 22; volleyArrowCost = 5; poolStock = 130;
                    }
                    break;
            }

            var territory = TerritoryLookup[outpost];
            territory.Radius = radius;
            Ecb.SetComponent(chunkIdx, outpost, territory);

            ushort newMaxHp = ResolveMaxHp(t, v);
            var hp = HpLookup[outpost];
            float ratio = hp.Max > 0 ? (float)hp.Value / hp.Max : 1f;
            hp.Max   = newMaxHp;
            hp.Value = (ushort)math.clamp((int)math.round(ratio * newMaxHp), 0, newMaxHp);
            Ecb.SetComponent(chunkIdx, outpost, hp);

            var volley = VolleyLookup[outpost];
            volley.CooldownSeconds = volleyCooldown;
            volley.Range           = volleyRange;
            volley.ArrowsPerVolley = volleyArrows;
            volley.ArrowCost       = volleyArrowCost;
            volley.DamagePerArrow  = volleyDamage;
            Ecb.SetComponent(chunkIdx, outpost, volley);

            if (PoolLookup.HasComponent(outpost))
            {
                var pool = PoolLookup[outpost];
                if (pool.Stock < poolStock) pool.Stock = poolStock;
                Ecb.SetComponent(chunkIdx, outpost, pool);
            }
            else
            {
                Ecb.AddComponent(chunkIdx, outpost, new OutpostArrowPool { Stock = poolStock });
            }

            if (visionRadius > 0f)
            {
                if (VisionLookup.HasComponent(outpost))
                    Ecb.SetComponent(chunkIdx, outpost, new VisionRadius { Value = visionRadius });
                else
                    Ecb.AddComponent(chunkIdx, outpost, new VisionRadius { Value = visionRadius });
            }
            else if (VisionLookup.HasComponent(outpost))
            {
                Ecb.RemoveComponent<VisionRadius>(chunkIdx, outpost);
            }
        }

        static ushort ResolveMaxHp(byte tier, byte variant)
        {
            if (tier >= 2) return 360;
            if (tier == 1)
            {
                if (variant == 1) return 240;
                if (variant == 2) return 280;
                return 260;
            }
            return 220;
        }
    }
}
