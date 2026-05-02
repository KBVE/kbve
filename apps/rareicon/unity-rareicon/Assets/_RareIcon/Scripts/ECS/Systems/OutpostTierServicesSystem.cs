using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Reactive on Outpost <see cref="BuildingTier"/> change — branches volley + territory radius + vision aura per <see cref="BuildingVariant"/>. T0 keeps the existing baseline. T1 default (Watchpost): wider territory + scout reveal aura. T1 alt 1 (BeaconOutpost): big VisionRadius signal-fire reveal, lighter volley. T1 alt 2 (Gatepost): chokepoint defender — heavy volley, tighter territory. T2 (Garrison): full volley + biggest territory ring.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildingUpgradeSystem))]
    public partial class OutpostTierServicesSystem : SystemBase
    {
        EntityQuery _outpostsWithTier;

        protected override void OnCreate()
        {
            _outpostsWithTier = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<OutpostTag, BuildingTier, TerritoryEmitter, OutpostVolley>()
                .Build(EntityManager);
            _outpostsWithTier.SetChangedVersionFilter(ComponentType.ReadOnly<BuildingTier>());
            RequireForUpdate(_outpostsWithTier);
        }

        protected override void OnUpdate()
        {
            var entities = _outpostsWithTier.ToEntityArray(Allocator.Temp);
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

        static void ApplyTier(EntityManager em, Entity outpost, byte tier, byte variant)
        {
            byte radius;
            float volleyCooldown, volleyRange, volleyDamage;
            byte volleyArrows, volleyArrowCost;
            ushort poolStock;
            float visionRadius = 0f;

            switch (tier)
            {
                case 0:
                    radius = 5;
                    volleyCooldown = 30f; volleyRange = 15f; volleyDamage = 8f;
                    volleyArrows = 20; volleyArrowCost = 5; poolStock = 100;
                    break;
                case 2: // Garrison
                    radius = 9;
                    volleyCooldown = 18f; volleyRange = 18f; volleyDamage = 11f;
                    volleyArrows = 28; volleyArrowCost = 6; poolStock = 200;
                    break;
                default: // tier 1 — branch on variant
                    if (variant == 1) // BeaconOutpost — vision focus
                    {
                        radius = 9;
                        volleyCooldown = 30f; volleyRange = 12f; volleyDamage = 6f;
                        volleyArrows = 12; volleyArrowCost = 3; poolStock = 70;
                        visionRadius = 12f;
                    }
                    else if (variant == 2) // Gatepost — chokepoint defender
                    {
                        radius = 5;
                        volleyCooldown = 22f; volleyRange = 14f; volleyDamage = 12f;
                        volleyArrows = 22; volleyArrowCost = 5; poolStock = 140;
                    }
                    else // Watchpost default
                    {
                        radius = 7;
                        volleyCooldown = 24f; volleyRange = 16f; volleyDamage = 9f;
                        volleyArrows = 22; volleyArrowCost = 5; poolStock = 130;
                    }
                    break;
            }

            var territory = em.GetComponentData<TerritoryEmitter>(outpost);
            territory.Radius = radius;
            em.SetComponentData(outpost, territory);

            var volley = em.GetComponentData<OutpostVolley>(outpost);
            volley.CooldownSeconds   = volleyCooldown;
            volley.Range             = volleyRange;
            volley.ArrowsPerVolley   = volleyArrows;
            volley.ArrowCost         = volleyArrowCost;
            volley.DamagePerArrow    = volleyDamage;
            em.SetComponentData(outpost, volley);

            if (em.HasComponent<OutpostArrowPool>(outpost))
            {
                var pool = em.GetComponentData<OutpostArrowPool>(outpost);
                if (pool.Stock < poolStock) pool.Stock = poolStock;
                em.SetComponentData(outpost, pool);
            }
            else
            {
                em.AddComponentData(outpost, new OutpostArrowPool { Stock = poolStock });
            }

            if (visionRadius > 0f)
            {
                if (em.HasComponent<VisionRadius>(outpost))
                    em.SetComponentData(outpost, new VisionRadius { Value = visionRadius });
                else
                    em.AddComponentData(outpost, new VisionRadius { Value = visionRadius });
            }
            else if (em.HasComponent<VisionRadius>(outpost))
            {
                em.RemoveComponent<VisionRadius>(outpost);
            }
        }
    }
}
