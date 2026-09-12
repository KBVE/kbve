using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Couples a unit's <see cref="Equipment"/> slots (shield/weapon/helmet/armor) to its <see cref="Unit"/> byte fields, pulls the highest-tier matching item out of the pack into each empty / lower-tier slot, and rebuilds <see cref="DefenseMitigation"/> for the damage pipeline. Change-filtered on Equipment + PackSlot so OnUpdate is a no-op while nothing has shifted; <see cref="RequireForUpdate"/> on the same query gates the call entirely. <see cref="EquipmentVisualMirrorSystem"/> turns the Unit bytes into MaterialProperty floats — this system is the only writer of Unit equipment bytes.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class EquipmentSyncSystem : SystemBase
    {
        EntityQuery _equipQuery;

        protected override void OnCreate()
        {
            _equipQuery = GetEntityQuery(
                ComponentType.ReadWrite<Equipment>(),
                ComponentType.ReadWrite<Unit>(),
                ComponentType.ReadWrite<PackSlot>());
            _equipQuery.SetChangedVersionFilter(new[]
            {
                ComponentType.ReadOnly<Equipment>(),
                ComponentType.ReadOnly<PackSlot>(),
            });
            RequireForUpdate(_equipQuery);
        }

        protected override void OnUpdate()
        {
            var em = EntityManager;
            using var entities = _equipQuery.ToEntityArray(Allocator.Temp);

            for (int i = 0; i < entities.Length; i++)
            {
                var entity = entities[i];
                var equipment = em.GetComponentData<Equipment>(entity);
                var pack      = em.GetBuffer<PackSlot>(entity);

                bool changed = false;
                changed |= AutoEquip(ref pack, ref equipment.ShieldItemId, ref equipment.ShieldHp, EquipmentSlot.Shield);
                changed |= AutoEquip(ref pack, ref equipment.WeaponItemId, ref equipment.WeaponHp, EquipmentSlot.Weapon);
                changed |= AutoEquip(ref pack, ref equipment.HelmetItemId, ref equipment.HelmetHp, EquipmentSlot.Helmet);
                changed |= AutoEquip(ref pack, ref equipment.ArmorItemId,  ref equipment.ArmorHp,  EquipmentSlot.Armor);

                if (changed) em.SetComponentData(entity, equipment);

                var unit = em.GetComponentData<Unit>(entity);
                byte shieldByte = equipment.ShieldHp > 0 ? EquipmentMap.ShieldVisualFor(equipment.ShieldItemId) : (byte)0;
                byte weaponByte = equipment.WeaponHp > 0 ? EquipmentMap.WeaponVisualFor(equipment.WeaponItemId) : (byte)0;
                byte helmetByte = equipment.HelmetHp > 0 ? EquipmentMap.HelmetVisualFor(equipment.HelmetItemId) : (byte)0;
                byte armorByte  = equipment.ArmorHp  > 0 ? EquipmentMap.ArmorVisualFor (equipment.ArmorItemId)  : (byte)0;

                bool unitDirty = false;
                if (shieldByte != 0 && unit.Shield != shieldByte) { unit.Shield = shieldByte; unitDirty = true; }
                else if (shieldByte == 0 && unit.Shield != 0)     { unit.Shield = 0;          unitDirty = true; }

                if (weaponByte != 0 && unit.Weapon != weaponByte) { unit.Weapon = weaponByte; unitDirty = true; }
                else if (weaponByte == 0 && unit.Weapon != 0 && equipment.WeaponItemId != 0) { unit.Weapon = 0; unitDirty = true; }

                if (helmetByte != 0 && unit.Helmet != helmetByte) { unit.Helmet = helmetByte; unitDirty = true; }
                else if (helmetByte == 0 && unit.Helmet != 0)     { unit.Helmet = 0;          unitDirty = true; }

                if (armorByte != 0 && unit.Armor != armorByte) { unit.Armor = armorByte; unitDirty = true; }
                else if (armorByte == 0 && unit.Armor != 0)    { unit.Armor = 0;         unitDirty = true; }

                if (unitDirty) em.SetComponentData(entity, unit);

                var shieldRoll = equipment.ShieldHp > 0
                    ? DefenseDB.ShieldMitigation(equipment.ShieldItemId)
                    : (mitigationPct: (byte)0, blockChancePct: (byte)0);
                var mit = new DefenseMitigation
                {
                    ArmorPct             = equipment.ArmorHp  > 0 ? DefenseDB.ArmorMitigationPct(equipment.ArmorItemId)   : (byte)0,
                    HelmetPct            = equipment.HelmetHp > 0 ? DefenseDB.HelmetMitigationPct(equipment.HelmetItemId) : (byte)0,
                    ShieldMitigationPct  = shieldRoll.mitigationPct,
                    ShieldBlockChancePct = shieldRoll.blockChancePct,
                };
                if (em.HasComponent<DefenseMitigation>(entity))
                    em.SetComponentData(entity, mit);
                else
                    em.AddComponentData(entity, mit);
            }
        }

        static bool AutoEquip(ref DynamicBuffer<PackSlot> pack, ref ushort current, ref ushort currentHp, EquipmentSlot slot)
        {
            int currentTier = currentHp > 0 ? EquipmentMap.Tier(current) : 0;
            int bestSlot = -1;
            int bestTier = currentTier;

            for (int s = 0; s < pack.Length; s++)
            {
                var entry = pack[s];
                if (entry.Count == 0) continue;
                if (entry.Hp == 0) continue;
                if (EquipmentMap.SlotFor(entry.ItemId) != slot) continue;
                int tier = EquipmentMap.Tier(entry.ItemId);
                if (tier > bestTier)
                {
                    bestTier = tier;
                    bestSlot = s;
                }
            }

            if (bestSlot < 0) return false;

            if (current != 0 && currentHp == 0)
                pack.Add(new PackSlot { ItemId = current, Count = 1, Hp = 0 });

            var picked = pack[bestSlot];
            current   = picked.ItemId;
            currentHp = picked.Hp > 0 ? picked.Hp : EquipmentDurability.MaxFor(picked.ItemId);
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
