using Unity.Entities;
using Unity.Rendering;

namespace RareIcon
{
    public static class GarrisonOps
    {
        public static void Garrison(EntityManager em, Entity unit, Entity host)
        {
            if (em.HasComponent<GarrisonedTag>(unit))
            {
                em.SetComponentData(unit, new GarrisonedTag { Host = host });
                em.SetComponentEnabled<GarrisonedTag>(unit, true);
            }
            else
            {
                em.AddComponentData(unit, new GarrisonedTag { Host = host });
            }
            if (em.HasComponent<DisableRendering>(unit) == false)
                em.AddComponent<DisableRendering>(unit);
        }

        public static void Release(EntityManager em, Entity unit)
        {
            if (em.HasComponent<GarrisonedTag>(unit))
            {
                em.SetComponentEnabled<GarrisonedTag>(unit, false);
                em.SetComponentData(unit, new GarrisonedTag { Host = Entity.Null });
            }
            if (em.HasComponent<DisableRendering>(unit))
                em.RemoveComponent<DisableRendering>(unit);
        }

        public static bool IsGarrisoned(EntityManager em, Entity unit)
            => em.HasComponent<GarrisonedTag>(unit) && em.IsComponentEnabled<GarrisonedTag>(unit);
    }
}
