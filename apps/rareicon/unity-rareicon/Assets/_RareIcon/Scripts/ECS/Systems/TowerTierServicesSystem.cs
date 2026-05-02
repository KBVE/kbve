using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Reactive on Tower <see cref="BuildingTier"/> change — attaches the volley defence kit, scales <see cref="TerritoryEmitter"/> radius per tier, and branches on <see cref="BuildingVariant"/> for T1 alt-picks. T0 stays a passive territory pole. T1 variants: 0 = WatchTower (defense — strong volley, radius 5), 1 = BeaconTower (hybrid — wider radius 7, light volley, mid VisionRadius), 2 = HighwatchTower (recon — no volley, big VisionRadius). T2 (SentinelTower) gets a heavier volley + radius 7. Removing tier downgrades cleanly.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildingUpgradeSystem))]
    public partial class TowerTierServicesSystem : SystemBase
    {
        EntityQuery _towersWithTier;

        protected override void OnCreate()
        {
            _towersWithTier = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<TowerTag, BuildingTier, TerritoryEmitter>()
                .Build(EntityManager);
            _towersWithTier.SetChangedVersionFilter(ComponentType.ReadOnly<BuildingTier>());
            RequireForUpdate(_towersWithTier);
        }

        protected override void OnUpdate()
        {
            var entities = _towersWithTier.ToEntityArray(Allocator.Temp);
            var em = EntityManager;

            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                byte tier    = em.GetComponentData<BuildingTier>(e).Value;
                byte variant = em.HasComponent<BuildingVariant>(e)
                    ? em.GetComponentData<BuildingVariant>(e).Value
                    : (byte)0;

                ApplyTier(em, e, tier, variant);
            }
            entities.Dispose();
        }

        static void ApplyTier(EntityManager em, Entity tower, byte tier, byte variant)
        {
            byte radius;
            bool wantsVolley;
            float volleyCooldown = 4f, volleyRange = 8f;
            byte volleyArrows = 6, volleyArrowCost = 1;
            float volleyDamage = 5f;
            ushort poolStock = 60;
            float visionRadius = 0f;

            switch (tier)
            {
                case 0:
                    radius = 3; wantsVolley = false;
                    break;
                case 2:
                    radius = 7; wantsVolley = true;
                    volleyCooldown = 3f; volleyRange = 12f;
                    volleyArrows = 12; volleyArrowCost = 2; volleyDamage = 7f;
                    poolStock = 120;
                    break;
                default: // tier 1 — branch on variant
                    if (variant == 1) // BeaconTower — hybrid
                    {
                        radius = 7; wantsVolley = true;
                        volleyCooldown = 5f; volleyRange = 10f;
                        volleyArrows = 4; volleyArrowCost = 1; volleyDamage = 4f;
                        poolStock = 40;
                        visionRadius = 10f;
                    }
                    else if (variant == 2) // HighwatchTower — pure recon
                    {
                        radius = 4; wantsVolley = false;
                        visionRadius = 14f;
                    }
                    else // WatchTower — defense default
                    {
                        radius = 5; wantsVolley = true;
                    }
                    break;
            }

            var territory = em.GetComponentData<TerritoryEmitter>(tower);
            territory.Radius = radius;
            em.SetComponentData(tower, territory);

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
                if (em.HasComponent<OutpostVolley>(tower)) em.SetComponentData(tower, volley);
                else em.AddComponentData(tower, volley);

                if (em.HasComponent<OutpostArrowPool>(tower))
                {
                    var pool = em.GetComponentData<OutpostArrowPool>(tower);
                    if (pool.Stock < poolStock) pool.Stock = poolStock;
                    em.SetComponentData(tower, pool);
                }
                else
                {
                    em.AddComponentData(tower, new OutpostArrowPool { Stock = poolStock });
                }
            }
            else
            {
                if (em.HasComponent<OutpostVolley>(tower))    em.RemoveComponent<OutpostVolley>(tower);
                if (em.HasComponent<OutpostArrowPool>(tower)) em.RemoveComponent<OutpostArrowPool>(tower);
            }

            if (visionRadius > 0f)
            {
                if (em.HasComponent<VisionRadius>(tower))
                    em.SetComponentData(tower, new VisionRadius { Value = visionRadius });
                else
                    em.AddComponentData(tower, new VisionRadius { Value = visionRadius });
            }
            else if (em.HasComponent<VisionRadius>(tower))
            {
                em.RemoveComponent<VisionRadius>(tower);
            }
        }
    }
}
