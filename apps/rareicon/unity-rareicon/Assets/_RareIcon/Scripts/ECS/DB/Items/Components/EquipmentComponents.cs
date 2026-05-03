using Unity.Entities;

namespace RareIcon
{
    /// <summary>Per-unit equipment slots. Currently shield-only; helmet/weapon/armor land here as their pickup loops mature. ShieldItemId is the itemdb key, not a ShieldType byte — letting the shader render specific shield variants and the loot pipeline drop the same canonical item back into the world. <c>EquipmentSyncSystem</c> writes the matching ShieldType byte to <see cref="UnitShieldVisual"/> on change.</summary>
    public struct Equipment : IComponentData
    {
        public ushort ShieldItemId;
    }

    /// <summary>Static map between an equipped shield itemdb key and the ShieldType byte the shader dispatches on. Keep in sync with itemdb keys + the SHIELD_* defines in HexUnit.shader. Burst-friendly — pure switch on numeric constants, no managed allocs.</summary>
    public static class EquipmentMap
    {
        public const ushort BUCKLER_ITEM        = 557;
        public const ushort WOODEN_SHIELD_ITEM  = 558;
        public const ushort IRON_SHIELD_ITEM    = 552;
        public const ushort KITE_SHIELD_ITEM    = 559;
        public const ushort GOLDPLATED_ITEM     = 560;

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

        public static int ShieldTier(ushort itemId)
        {
            switch (itemId)
            {
                case BUCKLER_ITEM:       return 1;
                case WOODEN_SHIELD_ITEM: return 2;
                case IRON_SHIELD_ITEM:   return 3;
                case KITE_SHIELD_ITEM:   return 4;
                case GOLDPLATED_ITEM:    return 5;
                default:                 return 0;
            }
        }

        public static bool IsShield(ushort itemId)
            => ShieldTier(itemId) > 0;
    }
}
