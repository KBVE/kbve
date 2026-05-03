using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Couples a unit's <see cref="Equipment"/> slot to its <see cref="Unit.Shield"/> byte and pulls the best shield in its pack into the equip slot. Runs every <see cref="PollInterval"/> seconds; the pack scan is cheap (≤ 8 slots/unit) and only entities with Equipment + Unit + PackSlot match. <see cref="EquipmentVisualMirrorSystem"/> writes the visual from the Unit byte, so both spawn-baked and equipped shields share one render path.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class EquipmentSyncSystem : SystemBase
    {
        const float PollInterval = 0.5f;
        float _accum;

        EntityQuery _equipQuery;

        protected override void OnCreate()
        {
            _equipQuery = GetEntityQuery(
                ComponentType.ReadWrite<Equipment>(),
                ComponentType.ReadWrite<Unit>(),
                ComponentType.ReadWrite<PackSlot>());
        }

        protected override void OnUpdate()
        {
            _accum += SystemAPI.Time.DeltaTime;
            if (_accum < PollInterval) return;
            _accum = 0f;

            if (_equipQuery.IsEmpty) return;

            var em = EntityManager;
            using var entities = _equipQuery.ToEntityArray(Allocator.Temp);

            for (int i = 0; i < entities.Length; i++)
            {
                var entity = entities[i];
                var equipment = em.GetComponentData<Equipment>(entity);
                var pack      = em.GetBuffer<PackSlot>(entity);

                int currentTier = EquipmentMap.ShieldTier(equipment.ShieldItemId);
                int bestSlot    = -1;
                int bestTier    = currentTier;

                for (int s = 0; s < pack.Length; s++)
                {
                    var slot = pack[s];
                    if (slot.Count == 0) continue;
                    int tier = EquipmentMap.ShieldTier(slot.ItemId);
                    if (tier > bestTier)
                    {
                        bestTier = tier;
                        bestSlot = s;
                    }
                }

                if (bestSlot >= 0)
                {
                    var slot = pack[bestSlot];
                    equipment.ShieldItemId = slot.ItemId;
                    if (slot.Count > 1)
                    {
                        slot.Count--;
                        pack[bestSlot] = slot;
                    }
                    else
                    {
                        pack.RemoveAt(bestSlot);
                    }
                    em.SetComponentData(entity, equipment);
                }

                byte targetByte = EquipmentMap.ShieldVisualFor(equipment.ShieldItemId);
                var unit = em.GetComponentData<Unit>(entity);
                if (unit.Shield != targetByte)
                {
                    unit.Shield = targetByte;
                    em.SetComponentData(entity, unit);
                }
            }
        }
    }
}
