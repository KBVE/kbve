namespace RareIcon
{
    /// <summary>Per-item base durability for the Hp counters on <see cref="Equipment"/>. <see cref="EquipmentLoadoutResolver"/> + <see cref="EquipmentSyncSystem"/> seed the slot Hp from this on equip; <see cref="DamageJob"/> decrements one Hp each time the slot mitigates a hit, and once Hp hits 0 the matching ItemId clears so the unit visibly loses the gear. Tuned so cheap kits (rusty sword, hood) decay inside one or two raids, while iron / crystal kits last several before needing a re-roll.</summary>
    public static class EquipmentDurability
    {
        public const ushort DefaultMax = 80;

        public static ushort MaxFor(ushort itemId)
        {
            switch (itemId)
            {
                case (ushort)ItemId.Hood:             return 60;
                case (ushort)ItemId.Leather:          return 90;
                case (ushort)ItemId.LeatherVest:      return 110;
                case (ushort)ItemId.ChainMail:        return 200;
                case (ushort)ItemId.IronArmor:        return 320;
                case (ushort)ItemId.CrystalArmor:     return 500;

                case (ushort)ItemId.WoodenShield:     return 70;
                case (ushort)ItemId.IronShield:       return 180;
                case (ushort)ItemId.KiteShield:       return 240;
                case (ushort)ItemId.GoldPlatedShield: return 360;

                case (ushort)ItemId.RustySword:       return 60;
                case (ushort)ItemId.IronSword:        return 220;

                default: return 0;
            }
        }
    }
}
