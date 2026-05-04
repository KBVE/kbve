using KBVE.Proto.Npc;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Resolves an MDX-defined equipment loadout (npc proto <see cref="EquipmentLoadout"/>) into the runtime <see cref="Equipment"/> + <see cref="Unit"/> bytes a fresh spawn needs. Spawn code calls <see cref="Apply"/> right after creating the unit; the Knight, Soldier, etc kits all flow through this so adding equipped items is an MDX edit + codegen, no spawn-code change. Falls back to zeroed slots when the npc has no equipment block (which is almost everyone today — beasts, civilians, ships).</summary>
    public static class EquipmentLoadoutResolver
    {
        public static string RefForUnitType(byte unitType)
        {
            switch (unitType)
            {
                case UnitType.Goblin:        return "goblin";
                case UnitType.Knight:        return "knight";
                case UnitType.Soldier:       return "soldier";
                case UnitType.Mage:          return "mage";
                case UnitType.King:          return "king";
                case UnitType.Archer:        return "archer";
                case UnitType.Rogue:         return "rogue";
                case UnitType.Cleric:        return "cleric";
                case UnitType.Merchant:      return "merchant";
                case UnitType.Bandit:        return "bandit";
                case UnitType.Zombie:        return "zombie";
                case UnitType.GoblinGeneral: return "goblin-general";
                case UnitType.Scout:         return "scout";
                case UnitType.BanditScout:   return "bandit-scout";
                case UnitType.Cavalry:       return "cavalry";
                case UnitType.Skeleton:      return "skeleton";
                default:                     return null;
            }
        }

        public static string RefForSkeletonVariant(byte variant)
        {
            switch (variant)
            {
                case SkeletonVariantValue.Guard:  return "skeleton-guard";
                case SkeletonVariantValue.Wraith: return "skeleton-wraith";
                case SkeletonVariantValue.Fungal: return "skeleton-fungal";
                case SkeletonVariantValue.Desert: return "skeleton-desert";
                default:                          return "skeleton";
            }
        }

        public static Equipment Resolve(byte unitType,
                                        out byte shieldByte,
                                        out byte weaponByte,
                                        out byte helmetByte,
                                        out byte armorByte)
            => ResolveByRef(RefForUnitType(unitType), out shieldByte, out weaponByte, out helmetByte, out armorByte);

        public static Equipment ResolveByRef(string refSlug,
                                             out byte shieldByte,
                                             out byte weaponByte,
                                             out byte helmetByte,
                                             out byte armorByte)
        {
            shieldByte = ShieldType.None;
            weaponByte = WeaponType.None;
            helmetByte = HelmetType.None;
            armorByte  = ArmorType.None;

            var equipment = new Equipment();

            if (string.IsNullOrEmpty(refSlug)) return equipment;
            if (!NpcdbCache.IsLoaded) return equipment;
            if (!NpcdbCache.TryGetByRef(refSlug, out var npc)) return equipment;
            if (npc.Equipment == null || npc.Equipment.Equipped == null) return equipment;

            for (int i = 0; i < npc.Equipment.Equipped.Count; i++)
            {
                var entry = npc.Equipment.Equipped[i];
                ushort itemId = ResolveItemRef(entry.ItemRef);
                if (itemId == 0) continue;

                switch (entry.Slot)
                {
                    case EquipSlot.OffHand:
                        equipment.ShieldItemId = itemId;
                        equipment.ShieldHp     = EquipmentDurability.MaxFor(itemId);
                        shieldByte = EquipmentMap.ShieldVisualFor(itemId);
                        break;
                    case EquipSlot.MainHand:
                        equipment.WeaponItemId = itemId;
                        equipment.WeaponHp     = EquipmentDurability.MaxFor(itemId);
                        byte v = EquipmentMap.WeaponVisualFor(itemId);
                        if (v != WeaponType.None) weaponByte = v;
                        break;
                    case EquipSlot.Head:
                        equipment.HelmetItemId = itemId;
                        equipment.HelmetHp     = EquipmentDurability.MaxFor(itemId);
                        helmetByte = EquipmentMap.HelmetVisualFor(itemId);
                        break;
                    case EquipSlot.Chest:
                        equipment.ArmorItemId = itemId;
                        equipment.ArmorHp     = EquipmentDurability.MaxFor(itemId);
                        armorByte = EquipmentMap.ArmorVisualFor(itemId);
                        break;
                }
            }

            return equipment;
        }

        static ushort ResolveItemRef(string itemRef)
        {
            if (string.IsNullOrEmpty(itemRef)) return 0;
            if (!ItemDBRefMap.RefToId.TryGetValue(itemRef, out var id)) return 0;
            return (ushort)id;
        }
    }
}
