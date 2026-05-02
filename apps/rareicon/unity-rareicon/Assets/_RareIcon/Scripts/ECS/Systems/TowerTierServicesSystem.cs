using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Reactive on Tower <see cref="BuildingTier"/> change — attaches the volley defence kit + scales <see cref="TerritoryEmitter"/> radius per tier. T0 stays a passive territory pole; T1 (WatchTower) gets a moderate arrow volley + radius 5; T2 (SentinelTower) gets a heavier volley + radius 7. Future alt-pick T1 variants (BeaconTower, HighwatchTower) can branch on a sibling tag without touching this system.</summary>
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
                byte tier = em.GetComponentData<BuildingTier>(e).Value;

                var territory = em.GetComponentData<TerritoryEmitter>(e);
                territory.Radius = tier switch
                {
                    2 => (byte)7,
                    1 => (byte)5,
                    _ => (byte)3,
                };
                em.SetComponentData(e, territory);

                if (tier == 0)
                {
                    if (em.HasComponent<OutpostVolley>(e))    em.RemoveComponent<OutpostVolley>(e);
                    if (em.HasComponent<OutpostArrowPool>(e)) em.RemoveComponent<OutpostArrowPool>(e);
                    continue;
                }

                ApplyVolley(em, e, tier);
            }
            entities.Dispose();
        }

        static void ApplyVolley(EntityManager em, Entity tower, byte tier)
        {
            float cooldown      = tier >= 2 ? 3f  : 4f;
            float range         = tier >= 2 ? 12f : 8f;
            byte  arrowsPerVoll = tier >= 2 ? (byte)12 : (byte)6;
            byte  arrowCost     = tier >= 2 ? (byte)2  : (byte)1;
            float damagePerArrow = tier >= 2 ? 7f : 5f;
            ushort poolStock    = tier >= 2 ? (ushort)120 : (ushort)60;

            var volley = new OutpostVolley
            {
                CooldownSeconds    = cooldown,
                TimeSinceVolley    = cooldown,
                Range              = range,
                ArrowsPerVolley    = arrowsPerVoll,
                ArrowCost          = arrowCost,
                SpreadHalfAngleRad = 0.45f,
                ProjectileSpeed    = 14f,
                ProjectileLifetime = 3f,
                DamagePerArrow     = damagePerArrow,
            };

            if (em.HasComponent<OutpostVolley>(tower))
                em.SetComponentData(tower, volley);
            else
                em.AddComponentData(tower, volley);

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
    }
}
