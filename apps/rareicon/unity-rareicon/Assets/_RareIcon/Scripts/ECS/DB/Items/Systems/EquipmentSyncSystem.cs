using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Couples a unit's <see cref="Equipment"/> slots (shield/weapon/helmet/armor) to its <see cref="Unit"/> byte fields, and pulls the highest-tier matching item out of the unit's pack into each empty / lower-tier slot. Runs every <see cref="PollInterval"/> seconds — pack ≤ 8 slots per unit, 4 slots scanned, so the per-tick cost stays trivial. Equipment is the source of truth; the pack copy is consumed on auto-equip. <see cref="EquipmentVisualMirrorSystem"/> turns the Unit bytes into MaterialProperty floats, so this system is the only writer of Unit equipment bytes.</summary>
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

                bool changed = false;
                changed |= AutoEquip(ref pack, ref equipment.ShieldItemId, EquipmentSlot.Shield);
                changed |= AutoEquip(ref pack, ref equipment.WeaponItemId, EquipmentSlot.Weapon);
                changed |= AutoEquip(ref pack, ref equipment.HelmetItemId, EquipmentSlot.Helmet);
                changed |= AutoEquip(ref pack, ref equipment.ArmorItemId,  EquipmentSlot.Armor);

                if (changed) em.SetComponentData(entity, equipment);

                var unit = em.GetComponentData<Unit>(entity);
                byte shieldByte = EquipmentMap.ShieldVisualFor(equipment.ShieldItemId);
                byte weaponByte = EquipmentMap.WeaponVisualFor(equipment.WeaponItemId);
                byte helmetByte = EquipmentMap.HelmetVisualFor(equipment.HelmetItemId);
                byte armorByte  = EquipmentMap.ArmorVisualFor (equipment.ArmorItemId);

                bool unitDirty = false;
                if (shieldByte != 0 && unit.Shield != shieldByte) { unit.Shield = shieldByte; unitDirty = true; }
                else if (shieldByte == 0 && unit.Shield != 0 && equipment.ShieldItemId == 0) { unit.Shield = 0; unitDirty = true; }

                if (weaponByte != 0 && unit.Weapon != weaponByte) { unit.Weapon = weaponByte; unitDirty = true; }
                if (helmetByte != 0 && unit.Helmet != helmetByte) { unit.Helmet = helmetByte; unitDirty = true; }
                if (armorByte  != 0 && unit.Armor  != armorByte ) { unit.Armor  = armorByte;  unitDirty = true; }

                if (unitDirty) em.SetComponentData(entity, unit);

                // Mirror equipment into combat-facing mitigation numbers
                // so DamageJob can read armor / shield reduction without
                // touching the Equipment payload. Lazy-add since most
                // early-game spawns ship without Equipment.
                var shieldRoll = DefenseDB.ShieldMitigation(equipment.ShieldItemId);
                var mit = new DefenseMitigation
                {
                    ArmorPct             = DefenseDB.ArmorMitigationPct(equipment.ArmorItemId),
                    HelmetPct            = DefenseDB.HelmetMitigationPct(equipment.HelmetItemId),
                    ShieldMitigationPct  = shieldRoll.mitigationPct,
                    ShieldBlockChancePct = shieldRoll.blockChancePct,
                };
                if (em.HasComponent<DefenseMitigation>(entity))
                    em.SetComponentData(entity, mit);
                else
                    em.AddComponentData(entity, mit);
            }
        }

        static bool AutoEquip(ref DynamicBuffer<PackSlot> pack, ref ushort current, EquipmentSlot slot)
        {
            int currentTier = EquipmentMap.Tier(current);
            int bestSlot = -1;
            int bestTier = currentTier;

            for (int s = 0; s < pack.Length; s++)
            {
                var entry = pack[s];
                if (entry.Count == 0) continue;
                if (EquipmentMap.SlotFor(entry.ItemId) != slot) continue;
                int tier = EquipmentMap.Tier(entry.ItemId);
                if (tier > bestTier)
                {
                    bestTier = tier;
                    bestSlot = s;
                }
            }

            if (bestSlot < 0) return false;

            var picked = pack[bestSlot];
            current = picked.ItemId;
            if (picked.Count > 1)
            {
                picked.Count--;
                pack[bestSlot] = picked;
            }
            else
            {
                pack.RemoveAt(bestSlot);
            }
            return true;
        }
    }
}
