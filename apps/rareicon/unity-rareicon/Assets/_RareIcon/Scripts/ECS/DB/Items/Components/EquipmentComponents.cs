using Unity.Entities;

namespace RareIcon
{
    /// <summary>Per-unit equipment slots. Stores itemdb keys (not the byte slot enum) so loot drops re-emit the same canonical item; <see cref="EquipmentSyncSystem"/> collapses each id into its <see cref="Unit"/> byte for the shader. One slot per equipment kind — multi-ring / multi-amulet stacking lands as a buffer if the design ever calls for it.</summary>
    public struct Equipment : IComponentData
    {
        public ushort ShieldItemId;
        public ushort WeaponItemId;
        public ushort HelmetItemId;
        public ushort ArmorItemId;
    }

    /// <summary>Combat-relevant defense numbers derived from <see cref="Equipment"/>. <see cref="EquipmentSyncSystem"/> rebuilds this whenever a slot changes; <see cref="DamageJob"/> reads it to scale incoming damage. <see cref="ArmorPct"/> + <see cref="HelmetPct"/> are flat percentages applied to every hit; <see cref="ShieldMitigationPct"/> is layered on top when the per-hit block roll succeeds at <see cref="ShieldBlockChancePct"/>. Burst-safe single struct.</summary>
    public struct DefenseMitigation : IComponentData
    {
        public byte ArmorPct;
        public byte HelmetPct;
        public byte ShieldMitigationPct;
        public byte ShieldBlockChancePct;
    }

    /// <summary>Slot-typing tag returned by <see cref="EquipmentMap.SlotFor"/>. Lets the sync system route a generic pack scan into the right Equipment field without per-call switch sprawl.</summary>
    public enum EquipmentSlot : byte
    {
        None   = 0,
        Shield = 1,
        Weapon = 2,
        Helmet = 3,
        Armor  = 4,
    }

    /// <summary>Static map between equipped itemdb keys and the byte slot enums the shader / Unit struct read. All-pure switches on numeric constants → Burst-safe with no managed alloc. Keep in sync with itemdb keys + the SHIELD_/HELMET_/etc defines in the unit shader.</summary>
    public static class EquipmentMap
    {
        public const ushort BUCKLER_ITEM        = 557;
        public const ushort WOODEN_SHIELD_ITEM  = 558;
        public const ushort IRON_SHIELD_ITEM    = 552;
        public const ushort KITE_SHIELD_ITEM    = 559;
        public const ushort GOLDPLATED_ITEM     = 560;

        public const ushort RUSTY_SWORD_ITEM    = 84;
        public const ushort IRON_SWORD_ITEM     = 551;

        public const ushort HOOD_ITEM           = 550;

        public const ushort CHAIN_MAIL_ITEM     = 93;
        public const ushort IRON_ARMOR_ITEM     = 553;

        public static EquipmentSlot SlotFor(ushort itemId)
        {
            switch (itemId)
            {
                case BUCKLER_ITEM:
                case WOODEN_SHIELD_ITEM:
                case IRON_SHIELD_ITEM:
                case KITE_SHIELD_ITEM:
                case GOLDPLATED_ITEM:
                    return EquipmentSlot.Shield;

                case RUSTY_SWORD_ITEM:
                case IRON_SWORD_ITEM:
                    return EquipmentSlot.Weapon;

                case HOOD_ITEM:
                    return EquipmentSlot.Helmet;

                case CHAIN_MAIL_ITEM:
                case IRON_ARMOR_ITEM:
                    return EquipmentSlot.Armor;

                default:
                    return EquipmentSlot.None;
            }
        }

        public static byte ShieldVisualFor(ushort itemId)
        {
            switch (itemId)
            {
                case BUCKLER_ITEM:       return ShieldType.Buckler;
                case WOODEN_SHIELD_ITEM: return ShieldType.Wooden;
                case IRON_SHIELD_ITEM:   return ShieldType.Iron;
                case KITE_SHIELD_ITEM:   return ShieldType.Kite;
                case GOLDPLATED_ITEM:    return ShieldType.GoldPlated;
                default:                 return ShieldType.None;
            }
        }

        public static byte WeaponVisualFor(ushort itemId)
        {
            switch (itemId)
            {
                case RUSTY_SWORD_ITEM:
                case IRON_SWORD_ITEM:
                    return WeaponType.Sword;
                default:
                    return WeaponType.None;
            }
        }

        public static byte HelmetVisualFor(ushort itemId)
        {
            switch (itemId)
            {
                case HOOD_ITEM: return HelmetType.Hood;
                default:        return HelmetType.None;
            }
        }

        public static byte ArmorVisualFor(ushort itemId)
        {
            switch (itemId)
            {
                case CHAIN_MAIL_ITEM: return ArmorType.ChainMail;
                case IRON_ARMOR_ITEM: return ArmorType.Iron;
                default:              return ArmorType.None;
            }
        }

        public static int Tier(ushort itemId)
        {
            switch (itemId)
            {
                case BUCKLER_ITEM:       return 1;
                case WOODEN_SHIELD_ITEM: return 2;
                case IRON_SHIELD_ITEM:   return 3;
                case KITE_SHIELD_ITEM:   return 4;
                case GOLDPLATED_ITEM:    return 5;

                case RUSTY_SWORD_ITEM:   return 1;
                case IRON_SWORD_ITEM:    return 3;

                case HOOD_ITEM:          return 1;

                case CHAIN_MAIL_ITEM:    return 2;
                case IRON_ARMOR_ITEM:    return 3;

                default:                 return 0;
            }
        }

        public static int ShieldTier(ushort itemId)
        {
            return SlotFor(itemId) == EquipmentSlot.Shield ? Tier(itemId) : 0;
        }
    }
}
